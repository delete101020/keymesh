// The unlocked state: keys and the plaintext vaults live here and nowhere else. Every change goes
// through one queue, so what the screens show never differs from what reached the disk, and a sync result
// never lands in the middle of a save (KM-006 FR21). sync.js holds no key: what needs one is a method here.
import {
  createAccount as coreCreateAccount,
  decryptVault,
  deriveFromPassword,
  encryptVault,
  unlockWithAccountKey,
  unwrapAccountKey,
} from './core/crypto.js';
import { KeymeshError } from './core/errors.js';
import { zeroize } from './core/bytes.js';
import { merge } from './core/merge.js';
import { newId, validateVault } from './core/model.js';
import { newVaultRow, syncedVaultRow, toRecord } from './store.js';
import { countPending, sameVault } from './vault-diff.js';

export const DEFAULT_VAULT_NAME = 'Vault mặc định';

export class LockedError extends Error {
  constructor() {
    super('Session is locked');
    this.name = 'LockedError';
  }
}

// Why a vault could not be opened or synced, as a code the screens turn into words. Never carries content.
export class VaultError extends Error {
  constructor(code) {
    super(`Vault: ${code}`);
    this.name = 'VaultError';
    this.code = code; // damaged | invalid-remote | server-older
  }
}

const opened = (r) => r.ok && validateVault(r.vault).ok;

// The vault shown when there is no saved choice: the oldest on the server, ties by id (FR28). Rows have
// no createdAt, so a caller that knows one passes it; otherwise id order, as KM-003 did.
export function pickActive(ids, createdAt = new Map()) {
  return [...ids].sort((a, b) => (createdAt.get(a) ?? 0) - (createdAt.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0))[0] ?? null;
}

export function createSession({ store, now = () => Date.now() }) {
  // { accountKey, deviceId, activeId, entries: Map<id, { vault, base, vaultKey, meta }>, failures: Map<id, KeymeshError> }
  let state = null;
  let queue = Promise.resolve();
  let epoch = 0;

  // One at a time, each on the result of the one before; a lock in between turns the job into LockedError.
  const run = (fn) => {
    const mine = epoch;
    const job = queue.then(async () => {
      if (!state || mine !== epoch) throw new LockedError();
      return fn(() => {
        if (!state || mine !== epoch) throw new LockedError();
      });
    });
    queue = job.catch(() => {});
    return job;
  };

  const entryOf = (id) => {
    const entry = state.entries.get(id);
    if (!entry) throw new VaultError('damaged');
    return entry;
  };

  // The plaintext behind an envelope this session wrote or received; base and current share it when equal.
  const baseFrom = async (entry, id, envelope, currentEnvelope) =>
    envelope.iv === currentEnvelope.iv ? structuredClone(entry.vault) : decryptVault(envelope, entry.vaultKey, id);

  async function openAll(accountKey, account) {
    const rows = await store.readVaultRows();
    const { vaults } = await unlockWithAccountKey(accountKey, rows.map(toRecord));
    const entries = new Map();
    const failures = new Map();
    for (const r of vaults) {
      const row = rows.find((x) => x.id === r.vaultId);
      if (!opened(r)) {
        failures.set(r.vaultId, r.ok ? new KeymeshError('format', 'vault') : r.error);
        continue;
      }
      let base = null;
      try {
        if (row.base) base = row.base.envelope.iv === row.current.envelope.iv ? structuredClone(r.vault) : await decryptVault(row.base.envelope, r.vaultKey, r.vaultId);
      } catch (e) {
        failures.set(r.vaultId, e instanceof KeymeshError ? e : new KeymeshError('format', 'vault'));
        continue;
      }
      entries.set(r.vaultId, { vault: r.vault, base, vaultKey: r.vaultKey, meta: r.meta });
    }
    const saved = account.activeVaultId;
    const activeId = saved && rows.some((x) => x.id === saved) ? saved : pickActive(entries.keys());
    // The vault on screen must open; any other may be broken without blocking the app (FR28).
    if (!activeId || !entries.has(activeId)) {
      const failure = failures.get(activeId) ?? new KeymeshError('format', 'vault');
      failure.vaultError = true;
      throw failure;
    }
    state = { accountKey, deviceId: account.deviceId, activeId, entries, failures };
  }

  const active = () => state?.entries.get(state.activeId) ?? null;

  return {
    get unlocked() {
      return state !== null;
    },
    get vault() {
      return active()?.vault ?? null;
    },
    get vaultMeta() {
      return active()?.meta ?? null;
    },
    get deviceId() {
      return state?.deviceId ?? null;
    },
    get activeVaultId() {
      return state?.activeId ?? null;
    },
    // Every vault of the account this session knows of: opened ones with their name, failed ones by id.
    get vaults() {
      if (!state) return [];
      return [
        ...[...state.entries].map(([id, e]) => ({ id, name: e.meta?.name ?? '', error: null })),
        ...[...state.failures].map(([id, e]) => ({ id, name: '', error: e.code === 'unsupported' ? 'unsupported' : 'damaged' })),
      ];
    },
    isOpen: (id) => Boolean(state?.entries.has(id)),

    hasAccount: async () => (await store.readAccount()) !== null,

    async createAccount(password) {
      const created = await coreCreateAccount(password, { meta: { name: DEFAULT_VAULT_NAME, color: null, order: 0 } });
      zeroize(created.authKey);
      const deviceId = newId('device');
      const [first] = created.vaults;
      const account = { userId: null, username: null, kdf: created.kdf, wrappedAccountKey: created.wrappedAccountKey, deviceId, activeVaultId: first.vaultId };
      await store.createAccount(account, created.records.map((r) => newVaultRow(r, now())));
      state = {
        accountKey: created.accountKey,
        deviceId,
        activeId: first.vaultId,
        entries: new Map([[first.vaultId, { vault: first.vault, base: null, vaultKey: first.vaultKey, meta: first.meta }]]),
        failures: new Map(),
      };
    },

    // Reads the disk every time, so a tab unlocking after another one locks sees the latest data.
    // Throws decrypt-failed for a wrong password; a damaged vault on screen throws with `vaultError` set.
    async unlock(password) {
      const account = await store.readAccount();
      if (!account) throw new KeymeshError('format', 'account');
      const { encKey, authKey } = await deriveFromPassword(password, account.kdf);
      zeroize(authKey);
      await openAll(await unwrapAccountKey(account.wrappedAccountKey, encKey), account);
    },

    // After a login has already unwrapped the account key (KM-006 FR07, FR08): no second key derivation.
    async openWith(accountKey) {
      const account = await store.readAccount();
      if (!account) throw new KeymeshError('format', 'account');
      await openAll(accountKey, account);
    },

    // Runs fn on a copy of the vault on screen, encrypts, writes, and only then replaces it in memory.
    mutate(fn) {
      return run(async (alive) => {
        const id = state.activeId;
        const entry = entryOf(id);
        const copy = structuredClone(entry.vault);
        const out = fn(copy, { now: now(), deviceId: state.deviceId });
        const envelope = await encryptVault(copy, entry.vaultKey);
        await store.writeVaultCurrent(id, envelope, now());
        alive();
        entry.vault = copy;
        return out;
      });
    },

    // --- sync (KM-006). Each runs on the queue above; none returns plaintext. ----------------------

    // What the server now holds at `version` is `sent` (FR18). Dirty stays if a save came after it.
    commitPushed(id, sent, version) {
      return run(async (alive) => {
        const entry = entryOf(id);
        const row = await store.readVaultRow(id);
        const base = await baseFrom(entry, id, sent, row.current.envelope);
        await store.commitPush(id, sent, version);
        alive();
        entry.base = base;
      });
    },

    // A newer server copy (FR19, FR20, FR23, FR26). Returns { changed, dirty }: whether the vault in memory
    // changed, and whether there is something left to push. Throws VaultError and writes nothing when the
    // copy cannot be read, fails validation, cannot be merged, or is older than what this device has.
    applyRemote(id, envelope, version) {
      return run(async (alive) => {
        const entry = entryOf(id);
        const row = await store.readVaultRow(id);
        if (!row) throw new VaultError('damaged');
        // A server restored to an older copy must not quietly pull this device back with it (plan decision 1).
        if (version < row.current.version) throw new VaultError('server-older');
        let remote;
        try {
          remote = await decryptVault(envelope, entry.vaultKey, id);
        } catch {
          throw new VaultError('invalid-remote');
        }
        if (!validateVault(remote).ok) throw new VaultError('invalid-remote');
        const base = { envelope, version };
        let next = remote;
        let current = envelope;
        let dirty = false;
        if (row.current.dirty) {
          try {
            next = merge(entry.base, entry.vault, remote);
          } catch {
            throw new VaultError('invalid-remote');
          }
          // Nothing of ours left beyond what the server has (a push whose answer was lost): settled, no push.
          if (!sameVault(next, remote)) {
            current = await encryptVault(next, entry.vaultKey);
            dirty = true;
          } else next = remote;
        }
        const changed = !sameVault(next, entry.vault);
        await store.commitPull(id, { envelope: current, dirty, base, savedAt: dirty ? row.current.savedAt : now() });
        alive();
        entry.vault = next;
        entry.base = remote;
        return { changed, dirty };
      });
    },

    // A vault on the server this device does not have yet (FR27). Kept on disk even if it does not open,
    // so the error stays visible per vault and nothing is lost.
    addRemoteVault(item, blob) {
      return run(async (alive) => {
        const row = syncedVaultRow({ ...item, blob }, now());
        const [r] = (await unlockWithAccountKey(state.accountKey, [toRecord(row)])).vaults;
        await store.addVaultRow(row);
        alive();
        if (opened(r)) state.entries.set(item.id, { vault: r.vault, base: structuredClone(r.vault), vaultKey: r.vaultKey, meta: r.meta });
        else state.failures.set(item.id, r.ok ? new KeymeshError('format', 'vault') : r.error);
        return opened(r);
      });
    },

    // Registration was accepted (FR04): the row moves to `version` and the account gets its server identity.
    markRegistered({ userId, username, session, sent, version, metaVersion }) {
      return run(async (alive) => {
        const id = state.activeId;
        const entry = entryOf(id);
        const row = await store.readVaultRow(id);
        const base = await baseFrom(entry, id, sent, row.current.envelope);
        await store.commitRegistration({ userId, username, session, vaultId: id, sent, version, metaVersion });
        alive();
        entry.base = base;
      });
    },

    // FR32: items, projects and envs whose content differs from the last synced copy, over every vault.
    pendingCount() {
      if (!state) return 0;
      let n = 0;
      for (const e of state.entries.values()) n += countPending(e.base, e.vault);
      return n;
    },

    lock() {
      epoch++;
      state = null;
    },
  };
}
