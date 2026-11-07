import test from 'node:test';
import assert from 'node:assert/strict';
import { createSync, BACKOFF_MS, POLL_MS, DEBOUNCE_MS, SLOW_MS, STATUS } from '../src/public/js/sync.js';
import { createAuth } from '../src/public/js/auth.js';
import { createSession } from '../src/public/js/session.js';
import { createItem, updateItem } from '../src/public/js/core/model.js';
import { memoryStore } from '../testkit/memory-store.mjs';
import { fakeApi } from '../testkit/fake-api.mjs';

const PW = 'correct horse battery staple';

// Timers the test moves by hand; time starts at 0.
function fakeClock() {
  let t = 1_000_000;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    set: (fn, ms) => (timers.set(++seq, { fn, at: t + ms, ms }), seq),
    clear: (id) => timers.delete(id),
    delays: () => [...timers.values()].map((x) => x.ms).sort((a, b) => a - b),
    // Runs every timer due within `ms`, in order, letting each round finish before the next.
    async advance(ms, settle) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        t = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await settle();
      }
      t = end;
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 1));

// A device on the fake server, with its engine on the fake clock.
function device(server, clock, { visible = () => true, online = () => true } = {}) {
  const store = memoryStore();
  const session = createSession({ store, now: clock.now });
  const auth = createAuth({ store, session, api: server.api, now: clock.now });
  const events = [];
  const sync = createSync({ store, session, api: server.api, now: clock.now, setTimer: clock.set, clearTimer: clock.clear, isVisible: visible, isOnline: online, onChange: (e) => events.push(e) });
  const settle = async () => {
    for (let i = 0; i < 2000 && (sync.status.running || i < 3); i++) await tick();
  };
  const save = async (fn) => {
    const out = await session.mutate(fn);
    await sync.saved();
    return out;
  };
  return { store, session, auth, sync, events, settle, save };
}

async function pair() {
  const server = fakeApi();
  const clock = fakeClock();
  const a = device(server, clock);
  await a.session.createAccount(PW);
  const item = await a.session.mutate((v, ctx) => createItem(v, 'login', { title: 'Partner X' }, ctx));
  await a.auth.register({ username: 'kf', registrationToken: server.registrationToken, password: PW });
  const b = device(server, clock);
  await b.auth.login({ username: 'kf', password: PW });
  await a.sync.start();
  await b.sync.start();
  return { server, clock, a, b, item, id: a.store.row.id };
}

const count = (server, name) => server.calls.filter((c) => c === name).length;
const setPass = (id, v) => (vault, ctx) => updateItem(vault, id, { fields: vault.items.find((i) => i.id === id).fields.map((f) => ({ id: f.id, v: f.label === 'Password' ? v : f.v })) }, ctx);
const passOf = (session) => session.vault.items[0].fields.find((f) => f.label === 'Password').v;

test('KM-006 AC01 FR15 an account never registered makes no request at all', async () => {
  const server = fakeApi();
  const clock = fakeClock();
  const a = device(server, clock);
  await a.session.createAccount(PW);
  await a.sync.start();
  await a.save((v, ctx) => createItem(v, 'note', { title: 'x' }, ctx));
  await clock.advance(10 * 60_000, a.settle);
  assert.deepEqual(server.calls, []);
  assert.equal(a.sync.status.kind, STATUS.local);
});

test('KM-006 FR16 NFR10 started: one list, then a poll every 50 s while in the foreground', async () => {
  const { server, clock, a } = await pair();
  assert.equal(a.sync.status.kind, STATUS.synced);
  assert.ok(a.events.some((e) => e.kind === STATUS.syncing), 'the bar says a round is running (FR31)');
  assert.ok(clock.delays().includes(POLL_MS));
  const before = count(server, 'listVaults');
  await clock.advance(3 * POLL_MS + 10, async () => {
    await a.settle();
  });
  assert.ok(count(server, 'listVaults') - before >= 3);
});

test('KM-006 AC21 AC23 FR16 FR18 FR20 a save is pushed 1.5 s later and the other device pulls it on its poll', async () => {
  const { server, clock, a, b, item } = await pair();
  await a.save(setPass(item.id, 'new'));
  assert.equal(a.sync.status.kind, STATUS.pending);
  assert.ok(clock.delays().includes(DEBOUNCE_MS));
  await clock.advance(DEBOUNCE_MS, a.settle);
  assert.equal(count(server, 'putVault'), 1);
  assert.equal(a.store.row.current.dirty, false);
  assert.equal(a.sync.status.kind, STATUS.synced);
  await clock.advance(POLL_MS, async () => {
    await a.settle();
    await b.settle();
  });
  assert.equal(passOf(b.session), 'new');
  assert.ok(b.session.vault.items[0].history.length >= 1);
  assert.ok(b.events.some((e) => e.changed));
});

test('KM-006 AC24 NFR06 both edit the same field offline: merged on 409, ≤ 2 pushes, same content on both', async () => {
  const { server, a, b, item } = await pair();
  await a.session.mutate(setPass(item.id, 'from A'));
  await b.session.mutate(setPass(item.id, 'from B'));
  await a.sync.syncNow();
  const puts = count(server, 'putVault');
  await b.sync.syncNow();
  assert.ok(count(server, 'putVault') - puts <= 2);
  await a.sync.syncNow();
  assert.deepEqual(a.session.vault, b.session.vault);
  assert.notEqual(a.session.vault.items[0].conflict, null);
});

test('KM-006 AC27 FR18 a save during an accepted push stays pending and goes on the next round', async () => {
  const { server, a, item } = await pair();
  let release;
  const held = new Promise((r) => (release = r));
  server.override('putVault', async (real, ...args) => {
    await held;
    return real(...args);
  });
  await a.session.mutate(setPass(item.id, 'p1'));
  const first = a.sync.syncNow();
  for (let i = 0; i < 50 && count(server, 'putVault') === 0; i++) await tick();
  await a.session.mutate((v, ctx) => updateItem(v, item.id, { notes: 'p2 note' }, ctx));
  release();
  await first;
  server.reset('putVault');
  await a.settle();
  await a.sync.syncNow();
  const onServer = [...server.vaults.values()][0];
  assert.equal(a.store.row.current.dirty, false);
  assert.equal(onServer.version, a.store.row.current.version);
  assert.equal(a.session.vault.items[0].notes, 'p2 note');
});

test('KM-006 AC30 FR26 a push the server took but whose answer was lost settles with no extra push and no mark', async () => {
  const { server, a, item } = await pair();
  server.override('putVault', async (real, ...args) => (real(...args), { ok: false, kind: 'network' }));
  await a.session.mutate(setPass(item.id, 'p1'));
  await a.sync.syncNow();
  server.reset('putVault');
  assert.equal(a.store.row.current.dirty, true);
  const puts = count(server, 'putVault');
  await a.sync.syncNow();
  assert.equal(count(server, 'putVault'), puts);
  assert.equal(a.store.row.current.dirty, false);
  assert.equal(a.session.vault.items[0].conflict, null);
});

test('KM-006 AC31 FR24 network down: retries after 2, 5, 15, 60, 60 s; syncNow resets; data stays', async () => {
  const { server, clock, a, b, item } = await pair();
  b.sync.stop(); // one clock for both devices: only A's timers here
  server.override('listVaults', async () => ({ ok: false, kind: 'network' }));
  await a.session.mutate(setPass(item.id, 'kept'));
  await a.sync.syncNow();
  assert.equal(a.sync.status.kind, STATUS.offline);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    seen.push(clock.delays()[0]);
    await clock.advance(clock.delays()[0], a.settle);
  }
  assert.deepEqual(seen, [...BACKOFF_MS, 60000]);
  await a.sync.syncNow();
  assert.equal(clock.delays()[0], BACKOFF_MS[0]);
  server.reset('listVaults');
  await clock.advance(BACKOFF_MS[0], a.settle);
  assert.equal(a.store.row.current.dirty, false);
  assert.equal(a.sync.status.kind, STATUS.synced);
});

test('KM-006 FR24 a 5xx shows an error, not offline, and backs off the same way', async () => {
  const { server, clock, a, b } = await pair();
  b.sync.stop();
  server.override('listVaults', async () => ({ ok: false, kind: 'http', status: 500, code: 'internal' }));
  await a.sync.syncNow();
  assert.equal(a.sync.status.kind, STATUS.error);
  assert.equal(a.sync.status.cause, 'server');
  assert.equal(clock.delays()[0], BACKOFF_MS[0]);
});

test('KM-006 AC32 FR25 401: stops, remembered on disk, no request until login; pending changes then go up', async () => {
  const { server, clock, a, b, item } = await pair();
  b.sync.stop();
  server.sessions.clear();
  await a.sync.syncNow();
  assert.equal(a.sync.status.kind, STATUS.needsLogin);
  assert.deepEqual(a.store.session, { token: null, needsLogin: true });
  await a.save(setPass(item.id, 'while out'));
  const n = server.calls.length;
  await clock.advance(10 * 60_000, a.settle);
  a.sync.stop();
  await a.sync.start();
  await a.sync.syncNow();
  assert.equal(server.calls.length, n, 'nothing sent, even after reopening');
  assert.deepEqual(await a.auth.login({ username: 'kf', password: PW }), { ok: true, kind: 'same' });
  await a.sync.start();
  assert.equal(a.store.row.current.dirty, false);
  assert.equal(passOf(a.session), 'while out');
});

test('KM-006 AC33 FR25 403, 400, 404, 413: the cause per vault, a minute before trying again, nothing lost', async () => {
  for (const [status, cause] of [[403, 'forbidden'], [400, 'bad-request'], [404, 'not-found'], [413, 'too-large']]) {
    const { server, clock, a, b, item } = await pair();
    b.sync.stop();
    server.override('putVault', async () => ({ ok: false, kind: 'http', status, code: 'x' }));
    await a.session.mutate(setPass(item.id, 'kept'));
    await a.sync.syncNow();
    const v = a.sync.status.vaults[0];
    assert.equal(v.error, cause, String(status));
    assert.equal(a.sync.status.kind, STATUS.error);
    assert.equal(clock.delays()[0], SLOW_MS);
    assert.equal(a.store.row.current.dirty, true);
    assert.equal(passOf(a.session), 'kept');
  }
});

test('KM-006 FR25 413 is not sent again until the vault changes', async () => {
  const { server, a, item } = await pair();
  server.override('putVault', async () => ({ ok: false, kind: 'http', status: 413, code: 'too_large' }));
  await a.session.mutate(setPass(item.id, 'big'));
  await a.sync.syncNow();
  const n = count(server, 'putVault');
  await a.sync.syncNow();
  assert.equal(count(server, 'putVault'), n);
  await a.session.mutate(setPass(item.id, 'smaller'));
  await a.sync.syncNow();
  assert.equal(count(server, 'putVault'), n + 1);
});

test('KM-006 AC34 FR23 a server copy that does not decrypt: nothing changes, no push for it; a good copy clears it', async () => {
  const { server, a, b, item, id } = await pair();
  await a.session.mutate(setPass(item.id, 'local pending'));
  const v = server.vaults.get(id);
  v.version += 1;
  v.blob = { ...v.blob, iv: 'AAAAAAAAAAAAAAAA', ct: v.blob.ct };
  const before = JSON.stringify(a.store.row);
  await a.sync.syncNow();
  assert.equal(a.sync.status.vaults[0].error, 'invalid-remote');
  assert.equal(JSON.stringify(a.store.row), before);
  assert.equal(count(server, 'putVault'), 0);
  const gets = count(server, 'getVault');
  await a.sync.syncNow();
  assert.equal(count(server, 'getVault'), gets, 'the same bad version is not fetched again');
  assert.equal(count(server, 'putVault'), 0);
  // Another device writes a valid copy: a new version, read again, error gone.
  await b.session.mutate(setPass(item.id, 'from B'));
  v.blob = b.store.row.current.envelope;
  v.version += 1;
  await a.sync.syncNow();
  assert.equal(a.sync.status.vaults[0].error, null);
  assert.equal(a.store.row.current.dirty, false);
});

test('KM-006 AC37 FR27 a vault the server no longer lists: error of its own, nothing deleted', async () => {
  const { server, a, id } = await pair();
  server.vaults.delete(id);
  await a.sync.syncNow();
  assert.equal(a.sync.status.vaults[0].error, 'not-found');
  assert.ok(a.store.rowOf(id));
  assert.equal(a.session.vault.items[0].title, 'Partner X');
});

test('KM-006 AC38 FR29 nothing changed: polls answer 304 and fetch no blob; one write elsewhere is one fetch', async () => {
  const { server, clock, a, b, item } = await pair();
  const gets = count(server, 'getVault');
  const statuses = [];
  const real = server.api.listVaults;
  server.api.listVaults = async (...args) => {
    const r = await real(...args);
    statuses.push(r.status);
    return r;
  };
  await clock.advance(3 * POLL_MS, async () => {
    await a.settle();
    await b.settle();
  });
  assert.ok(statuses.length >= 3 && statuses.every((s) => s === 304), JSON.stringify(statuses));
  assert.equal(count(server, 'getVault'), gets);
  await b.save(setPass(item.id, 'once'));
  await clock.advance(DEBOUNCE_MS, b.settle);
  await a.sync.syncNow();
  assert.equal(count(server, 'getVault'), gets + 1);
});

test('KM-006 AC39 NFR06 NFR10 ten quiet minutes on two devices: no write, no ping-pong, ~1 list per 50 s each', async () => {
  const { server, clock, a, b } = await pair();
  const lists = count(server, 'listVaults');
  const version = [...server.vaults.values()][0].version;
  await clock.advance(10 * 60_000, async () => {
    await a.settle();
    await b.settle();
  });
  assert.equal(count(server, 'putVault'), 0);
  assert.equal([...server.vaults.values()][0].version, version);
  const perDevice = (count(server, 'listVaults') - lists) / 2;
  assert.ok(perDevice >= 11 && perDevice <= 13, String(perDevice));
});

test('KM-006 AC22 FR15 plan decision 8 hidden: no poll, no retry; a save made just before still goes once', async () => {
  let shown = true;
  const server = fakeApi();
  const clock = fakeClock();
  const a = device(server, clock, { visible: () => shown });
  await a.session.createAccount(PW);
  const item = await a.session.mutate((v, ctx) => createItem(v, 'login', { title: 'Partner X' }, ctx));
  await a.auth.register({ username: 'kf', registrationToken: server.registrationToken, password: PW });
  await a.sync.start();
  await a.save(setPass(item.id, 'just before'));
  shown = false;
  a.sync.hidden();
  await clock.advance(10 * 60_000, a.settle);
  assert.equal(count(server, 'putVault'), 1);
  assert.equal(a.store.row.current.dirty, false);
  assert.deepEqual(clock.delays(), [], 'nothing scheduled while hidden');
  const n = server.calls.length;
  shown = true;
  await a.sync.syncNow();
  assert.equal(server.calls.length, n + 1);
});

test('KM-006 AC43 FR34 sync now during a round makes no second one; offline answers at once with no request', async () => {
  let online = true;
  const server = fakeApi();
  const clock = fakeClock();
  const a = device(server, clock, { online: () => online });
  await a.session.createAccount(PW);
  await a.auth.register({ username: 'kf', registrationToken: server.registrationToken, password: PW });
  await a.sync.start();
  const n = count(server, 'listVaults');
  const one = a.sync.syncNow();
  const two = a.sync.syncNow();
  await Promise.all([one, two]);
  assert.ok(count(server, 'listVaults') - n <= 2);
  online = false;
  const m = server.calls.length;
  await a.sync.syncNow();
  assert.equal(a.sync.status.kind, STATUS.offline);
  assert.equal(server.calls.length, m);
});

test('KM-006 AC35 FR17 FR27 a second vault from the server is added; when one vault fails the other still syncs', async () => {
  const { server, a, b, item, id } = await pair();
  const c = await import('../src/public/js/core/crypto.js');
  const { createVault } = await import('../src/public/js/core/model.js');
  const { encKey } = await c.deriveFromPassword(PW, a.store.account.kdf);
  const accountKey = await c.unwrapAccountKey(a.store.account.wrappedAccountKey, encKey);
  const other = '0000000000000002';
  const vaultKey = await c.generateVaultKey();
  server.put({
    id: other,
    userId: [...server.vaults.values()][0].userId,
    version: 1,
    metaVersion: 1,
    wrappedVaultKey: await c.wrapVaultKey(vaultKey, accountKey, other),
    meta: await c.encryptVaultMeta({ name: 'Thứ hai', color: null, order: 1 }, vaultKey, other),
    blob: await c.encryptVault(createVault(other), vaultKey),
    createdAt: 0,
  });
  const shown = a.session.activeVaultId;
  await a.sync.syncNow();
  assert.ok(a.store.rowOf(other));
  assert.equal(a.session.activeVaultId, shown);
  // Break the second vault on the server; the first still pulls B's change.
  const v2 = server.vaults.get(other);
  v2.version += 1;
  v2.blob = { ...v2.blob, iv: 'AAAAAAAAAAAAAAAA' };
  await b.sync.syncNow();
  await b.session.mutate(setPass(item.id, 'from B'));
  await b.sync.syncNow();
  await a.sync.syncNow();
  const byId = new Map(a.sync.status.vaults.map((v) => [v.id, v]));
  assert.equal(byId.get(other).error, 'invalid-remote');
  assert.equal(byId.get(id).error, null);
  assert.equal(passOf(a.session), 'from B');
});

test('KM-006 FR30 a vault of 1 000 000 bytes or more is flagged, not blocked', async () => {
  const { server, a, id } = await pair();
  const real = server.api.listVaults;
  server.api.listVaults = async (token) => {
    const r = await real(token); // no ETag: a full list carrying the new size
    if (r.body) r.body.items = r.body.items.map((i) => (i.id === id ? { ...i, size: 1_000_000 } : i));
    return r;
  };
  await a.sync.syncNow();
  assert.equal(a.sync.status.large, true);
  assert.equal(a.sync.status.vaults[0].large, true);
});
