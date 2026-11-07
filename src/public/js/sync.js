// Sync engine (docs/05, KM-006 FR15–FR34): when to sync, backoff, and the state shown in the status bar.
// It holds no key and no plaintext: pulling, merging and recording a push are session methods, run on the
// same queue as saves. Time, network and foreground come in from the caller, so tests drive them (NFR14).
import { VaultError, LockedError } from './session.js';

export const DEBOUNCE_MS = 1500;
export const POLL_MS = 50_000;
export const BACKOFF_MS = Object.freeze([2000, 5000, 15000, 60000]);
export const SLOW_MS = 60_000; // 400, 403, 404, 413: never again faster than this with the same data
export const MAX_ROUNDS = 5; // 409s in a row in one run (FR19)
export const LARGE_BYTES = 1_000_000;
export const LIMIT_BYTES = 2_000_000;

// Status kinds, in the order the bar shows them when several apply (FR31).
export const STATUS = Object.freeze({
  local: 'local', // never registered: "Chỉ trên máy này"
  loggedOut: 'logged-out',
  needsLogin: 'needs-login',
  error: 'error',
  syncing: 'syncing',
  offline: 'offline',
  pending: 'pending',
  synced: 'synced',
});

const httpCause = (r) => (r.status === 413 ? 'too-large' : r.status === 404 ? 'not-found' : r.status === 403 ? 'forbidden' : r.status >= 500 ? 'server' : 'bad-request');

export function createSync({
  store,
  session,
  api,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
  isOnline = () => globalThis.navigator?.onLine !== false,
  isVisible = () => globalThis.document?.visibilityState !== 'hidden',
  onChange = () => {},
}) {
  let active = false; // between start() and stop()
  let mode = STATUS.local; // local | logged-out | needs-login | on
  let running = null; // the round in progress
  let again = false;
  let timer = null;
  let debounce = null;
  let backoff = 0;
  let etag = null;
  let listed = null; // last list from the server, for 304
  let lastOk = null;
  let net = null; // null | 'offline' | 'server'
  let slow = false; // a 4xx this round: next try in SLOW_MS
  let dirtyAny = false;
  const vaults = new Map(); // id -> { error, lastOk, size, badVersion, blockedIv }
  let epoch = 0;

  const vaultState = (id) => {
    if (!vaults.has(id)) vaults.set(id, { error: null, lastOk: null, size: 0, badVersion: null, blockedIv: null });
    return vaults.get(id);
  };

  function status() {
    const list = session.vaults.map((v) => {
      const s = vaults.get(v.id);
      return { id: v.id, name: v.name, error: v.error ?? s?.error ?? null, lastOk: s?.lastOk ?? null, size: s?.size ?? 0, large: (s?.size ?? 0) >= LARGE_BYTES };
    });
    let kind;
    if (mode !== 'on') kind = mode;
    else if (list.some((v) => v.error) || net === 'server') kind = STATUS.error;
    else if (running) kind = STATUS.syncing;
    else if (net === 'offline') kind = STATUS.offline;
    else if (dirtyAny) kind = STATUS.pending;
    else kind = STATUS.synced;
    return { kind, pending: dirtyAny ? session.pendingCount() : 0, lastOk, cause: net, running: Boolean(running), vaults: list, large: list.some((v) => v.large) };
  }

  const emit = (changed = false) => onChange({ ...status(), changed });

  const clearRetry = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  function schedule(ms) {
    clearRetry();
    if (!active || mode !== 'on') return;
    timer = setTimer(() => {
      timer = null;
      run();
    }, ms);
  }

  // After a round: back off on network or 5xx, wait a minute on 4xx, else poll while in the foreground.
  // Nothing at all while hidden (FR15, NFR10); coming back runs at once.
  function plan() {
    if (!active || mode !== 'on' || !isVisible()) return clearRetry();
    if (net) {
      schedule(BACKOFF_MS[Math.min(backoff, BACKOFF_MS.length - 1)]);
      backoff++;
    } else {
      backoff = 0;
      schedule(slow ? SLOW_MS : POLL_MS);
    }
  }

  async function needsLogin() {
    mode = STATUS.needsLogin;
    clearRetry();
    etag = null;
    // Kept on disk, so reopening the app sends nothing until the user logs in again (AC32, NFR10).
    await store.writeSession({ token: null, needsLogin: true }).catch(() => {});
  }

  // One vault: pull if the server moved, then push while there is something pending (FR16–FR20, FR23).
  async function syncVault(token, item, alive) {
    const s = vaultState(item.id);
    s.size = item.size ?? s.size;
    let row = await store.readVaultRow(item.id);
    if (!session.isOpen(item.id)) return;
    if (item.version < row.current.version) {
      s.error = 'server-older';
      return;
    }
    let changed = false;
    if (item.version > row.current.version) {
      if (s.badVersion === item.version) return; // FR23: tried this copy already, wait for another
      const got = await api.getVault(token, item.id);
      alive();
      if (!got.ok) return got;
      try {
        changed = (await session.applyRemote(item.id, got.body.blob, got.body.version)).changed || changed;
      } catch (e) {
        if (!(e instanceof VaultError)) throw e;
        s.error = e.code;
        s.badVersion = got.body.version;
        return { changed };
      }
      s.badVersion = null;
      row = await store.readVaultRow(item.id);
    }
    for (let round = 0; row.current.dirty; round++) {
      if (round >= MAX_ROUNDS) return { changed, retry: true };
      if (s.blockedIv === row.current.envelope.iv) return { changed, blocked: true }; // 413: not again until it changes
      const sent = row.current.envelope;
      const put = await api.putVault(token, item.id, row.current.version, sent);
      alive();
      if (put.ok) {
        await session.commitPushed(item.id, sent, put.body.version);
        item.version = put.body.version;
      } else if (put.conflict) {
        try {
          changed = (await session.applyRemote(item.id, put.conflict.blob, put.conflict.version)).changed || changed;
        } catch (e) {
          if (!(e instanceof VaultError)) throw e;
          s.error = e.code;
          s.badVersion = put.conflict.version;
          return { changed };
        }
        item.version = put.conflict.version;
      } else {
        if (put.status === 413) s.blockedIv = sent.iv;
        return { ...put, changed };
      }
      row = await store.readVaultRow(item.id);
    }
    return { changed };
  }

  async function round(mine) {
    const alive = () => {
      if (mine !== epoch) throw new LockedError();
    };
    const current = await store.readSession();
    alive();
    if (!current?.token) {
      mode = current?.needsLogin ? STATUS.needsLogin : STATUS.loggedOut;
      return false;
    }
    const token = current.token;
    net = null;
    slow = false;
    const list = await api.listVaults(token, listed ? etag : null);
    alive();
    if (!list.ok) {
      if (list.status === 401) await needsLogin();
      else if (list.kind === 'network') net = 'offline';
      else if (list.status >= 500) net = 'server';
      else slow = true;
      return false;
    }
    if (!list.notModified) {
      listed = list.body.items;
      etag = list.etag;
    }
    let changed = false;
    const rows = await store.readVaultRows();
    const onServer = new Set(listed.map((i) => i.id));
    // FR27: never delete on a signal from the server; a vault it no longer lists is an error of its own.
    for (const row of rows) if (!onServer.has(row.id)) vaultState(row.id).error = 'not-found';
    for (const item of listed) {
      const s = vaultState(item.id);
      const had = s.error;
      s.error = null;
      try {
        if (!rows.some((r) => r.id === item.id)) {
          const got = await api.getVault(token, item.id);
          alive();
          if (!got.ok) throw Object.assign(new Error('http'), { result: got });
          await session.addRemoteVault(item, got.body.blob);
          changed = true;
          s.size = item.size ?? 0;
          s.lastOk = now();
          continue;
        }
        const r = await syncVault(token, item, alive);
        if (r?.changed) changed = true;
        if (r && r.ok === false) throw Object.assign(new Error('http'), { result: r });
        if (r?.retry) net = net ?? 'server';
        if (r?.blocked) {
          s.error = 'too-large';
          slow = true;
        }
        if (!s.error) s.lastOk = now();
      } catch (e) {
        if (e instanceof LockedError) throw e;
        const r = e.result;
        if (!r) {
          s.error = had ?? 'damaged';
          continue;
        }
        if (r.status === 401) {
          await needsLogin();
          return changed;
        }
        if (r.kind === 'network') net = 'offline';
        else if (r.status >= 500) net = net ?? 'server';
        else {
          s.error = httpCause(r);
          slow = true;
        }
      }
    }
    if (!net && [...vaults.values()].every((v) => !v.error)) lastOk = now();
    return changed;
  }

  async function refreshDirty() {
    dirtyAny = (await store.readVaultRows().catch(() => [])).some((r) => r.current.dirty);
  }

  // One round at a time (FR16, FR34): a request during one marks it to run again once it ends.
  function run() {
    if (!active || mode !== 'on') return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    clearRetry();
    const mine = epoch;
    running = (async () => {
      emit();
      let changed = false;
      try {
        changed = await round(mine);
      } catch (e) {
        if (e instanceof LockedError || mine !== epoch) return;
        net = net ?? 'server';
      } finally {
        if (mine === epoch) {
          running = null;
          await refreshDirty();
        }
      }
      if (mine !== epoch) return;
      emit(changed);
      if (again) {
        again = false;
        return run();
      }
      plan();
    })();
    return running;
  }

  return {
    get status() {
      return status();
    },

    // After unlock (FR15, FR16): nothing for an account that is not registered or not logged in.
    async start() {
      epoch++;
      active = true;
      backoff = 0;
      net = null;
      vaults.clear();
      for (const v of session.vaults) if (v.error) vaultState(v.id);
      const account = await store.readAccount();
      const current = await store.readSession();
      await refreshDirty();
      if (!account?.userId) mode = STATUS.local;
      else if (!current?.token) mode = current?.needsLogin ? STATUS.needsLogin : STATUS.loggedOut;
      else mode = 'on';
      emit();
      if (mode === 'on') return run();
    },

    // On lock or logout: timers off, ETag forgotten; a round in flight ends in LockedError on its next step.
    stop() {
      epoch++;
      active = false;
      running = null;
      again = false;
      clearRetry();
      if (debounce !== null) clearTimer(debounce);
      debounce = null;
      etag = null;
      listed = null;
    },

    // A save landed: push 1.5 s after the last one. Runs once even if the app went to the background in
    // between, so switching apps right after saving does not hold the change back (plan decision 8).
    async saved() {
      await refreshDirty();
      emit();
      if (!active || mode !== 'on') return;
      if (debounce !== null) clearTimer(debounce);
      debounce = setTimer(() => {
        debounce = null;
        run();
      }, DEBOUNCE_MS);
    },

    // Foreground, back online, or "Đồng bộ ngay": at once, backoff reset (FR24, FR34).
    syncNow() {
      backoff = 0;
      if (!isOnline()) {
        net = 'offline';
        emit();
        return Promise.resolve();
      }
      return run();
    },
    hidden() {
      clearRetry();
    },
    // Fills in the counts after the vault changed in memory (a save), without a round.
    refresh: () => refreshDirty().then(() => emit()),
  };
}
