import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, LockedError, DEFAULT_VAULT_NAME, pickActive } from '../src/public/js/session.js';
import { createItem, updateItem, isId } from '../src/public/js/core/model.js';
import { flipB64, hasCode } from '../testkit/helpers.js';
import { memoryStore } from '../testkit/memory-store.mjs';

const PW = 'correct horse battery ệ';

async function ready() {
  const store = memoryStore();
  const session = createSession({ store });
  await session.createAccount(PW);
  return { store, session };
}

test('KM-003 AC03 FR03 FR04 a new account: one vault named by default, device id, no authKey', async () => {
  const { store, session } = await ready();
  assert.equal(session.vaultMeta.name, DEFAULT_VAULT_NAME);
  assert.equal(session.vaultMeta.name, 'Vault mặc định');
  assert.ok(isId(store.account.deviceId) && store.account.deviceId.startsWith('d_'));
  assert.equal(store.account.userId, null);
  assert.equal(store.account.username, null);
  assert.ok(!JSON.stringify(store.account).includes('authKey'));
  assert.ok(!JSON.stringify(store.row).includes('authKey'));
  assert.deepEqual(
    [store.row.metaVersion, store.row.current.version, store.row.current.dirty, store.row.base, store.row.deletedAt],
    [0, 0, true, null, null],
  );
});

test('KM-003 AC05 FR05 FR06 FR07 right password opens (in either Unicode form), wrong one does not', async () => {
  const { store, session } = await ready();
  await session.mutate((v, ctx) => createItem(v, 'note', { title: 'kept' }, ctx));
  session.lock();
  const again = createSession({ store });
  await assert.rejects(again.unlock('wrong'), hasCode('decrypt-failed'));
  assert.equal(again.unlocked, false);
  await again.unlock(PW.normalize('NFD'));
  assert.equal(again.vault.items[0].title, 'kept');
});

test('KM-003 AC07 FR08 a damaged vault reports a vault error and nothing is overwritten', async () => {
  const { store, session } = await ready();
  session.lock();
  store.row.current.envelope.ct = flipB64(store.row.current.envelope.ct, 20);
  const before = JSON.stringify(store.row);
  const again = createSession({ store });
  await assert.rejects(again.unlock(PW), (e) => e.code === 'decrypt-failed' && e.vaultError === true);
  assert.equal(again.unlocked, false);
  assert.equal(JSON.stringify(store.row), before);
});

test('KM-003 AC20 FR23 a failed write: reported, memory unchanged, disk unchanged, next write works', async () => {
  const { store, session } = await ready();
  const item = await session.mutate((v, ctx) => createItem(v, 'note', { title: 'v1' }, ctx));
  const onDisk = JSON.stringify(store.row);
  store.failWrites = true;
  await assert.rejects(session.mutate((v, ctx) => updateItem(v, item.id, { title: 'v2' }, ctx)), /write failed/);
  assert.equal(session.vault.items[0].title, 'v1');
  assert.equal(JSON.stringify(store.row), onDisk);
  store.failWrites = false;
  await session.mutate((v, ctx) => updateItem(v, item.id, { title: 'v3' }, ctx));
  assert.equal(session.vault.items[0].title, 'v3');
});

test('KM-003 FR23 mutations run one at a time, each on the result of the last', async () => {
  const { session } = await ready();
  const results = await Promise.all(['a', 'b', 'c'].map((title) => session.mutate((v, ctx) => createItem(v, 'note', { title }, ctx))));
  assert.equal(results.length, 3);
  assert.deepEqual(session.vault.items.map((i) => i.title), ['a', 'b', 'c']);
});

test('KM-003 FR23 a throwing change writes nothing and does not block the queue', async () => {
  const { store, session } = await ready();
  const n = store.writes;
  await assert.rejects(session.mutate(() => {
    throw new Error('bad');
  }), /bad/);
  assert.equal(store.writes, n);
  await session.mutate((v, ctx) => createItem(v, 'note', { title: 'ok' }, ctx));
  assert.equal(session.vault.items.length, 1);
});

test('KM-003 AC08 FR12 lock drops keys and vault; a save racing with lock cannot bring them back', async () => {
  const { session } = await ready();
  const pending = session.mutate((v, ctx) => createItem(v, 'note', { title: 'x' }, ctx));
  session.lock();
  await assert.rejects(pending, LockedError);
  assert.equal(session.unlocked, false);
  assert.equal(session.vault, null);
  assert.equal(session.deviceId, null);
  await assert.rejects(session.mutate(() => {}), LockedError);
});

test('KM-003 AC04 FR03 a failed account write leaves the session closed', async () => {
  const store = memoryStore();
  store.failWrites = true;
  const session = createSession({ store });
  await assert.rejects(session.createAccount(PW), /write failed/);
  assert.equal(session.unlocked, false);
  assert.equal(await session.hasAccount(), false);
});

// --- KM-006: several vaults, results of sync -------------------------------------------------------

// A second device of the same account: what a login would have written, opened with the same password.
async function twin(store) {
  const other = memoryStore();
  await other.createAccount({ ...store.account, deviceId: 'd_bbbbbbbbbbbbbbbb' }, store.rows.map((r) => structuredClone(r)));
  const session = createSession({ store: other });
  await session.unlock(PW);
  return { store: other, session };
}

// Both devices registered at version 1 with the same content, as after a first sync.
async function synced() {
  const a = await ready();
  const item = await a.session.mutate((v, ctx) => createItem(v, 'login', { title: 'Partner X' }, ctx));
  await a.session.markRegistered({ userId: 'u_1', username: 'kf', session: { token: 't', expiresAt: 0 }, sent: a.store.row.current.envelope, version: 1, metaVersion: 1 });
  const b = await twin(a.store);
  return { a, b, item, id: a.store.row.id };
}

const passOf = (vault, title = 'Partner X') => {
  const item = vault.items.find((i) => i.title === title);
  return item.fields.find((f) => f.label === 'Password');
};
const setPass = (id, v) => (vault, ctx) => updateItem(vault, id, { fields: vault.items.find((i) => i.id === id).fields.map((f) => ({ id: f.id, v: f.label === 'Password' ? v : f.v })) }, ctx);

test('KM-006 FR04 registering moves the row to version 1 with base = what was sent, and fills the account', async () => {
  const { a } = await synced();
  const row = a.store.row;
  assert.deepEqual([row.current.version, row.current.dirty, row.base.version, row.metaVersion], [1, false, 1, 1]);
  assert.deepEqual(row.base.envelope, row.current.envelope);
  assert.deepEqual([a.store.account.userId, a.store.account.username, a.store.session.token], ['u_1', 'kf', 't']);
  assert.equal(a.session.pendingCount(), 0);
});

test('KM-006 AC27 FR18 a save while the push is out stays pending after the push is accepted', async () => {
  const { a, item, id } = await synced();
  await a.session.mutate(setPass(item.id, 'p1'));
  const sent = a.store.row.current.envelope;
  await a.session.mutate(setPass(item.id, 'p2')); // lands while the PUT of p1 is in flight
  await a.session.commitPushed(id, sent, 2);
  assert.deepEqual([a.store.row.current.dirty, a.store.row.current.version, a.store.row.base.version], [true, 2, 2]);
  assert.equal(passOf(a.session.vault).v, 'p2');
  assert.equal(a.session.pendingCount(), 1);
  await a.session.commitPushed(id, a.store.row.current.envelope, 3);
  assert.equal(a.store.row.current.dirty, false);
  assert.equal(a.session.pendingCount(), 0);
});

test('KM-006 FR20 a pull with nothing pending takes the server copy for both current and base', async () => {
  const { a, b, item, id } = await synced();
  await b.session.mutate(setPass(item.id, 'from B'));
  const r = await a.session.applyRemote(id, b.store.row.current.envelope, 2);
  assert.deepEqual(r, { changed: true, dirty: false });
  assert.equal(passOf(a.session.vault).v, 'from B');
  assert.deepEqual(a.store.row.current.envelope, b.store.row.current.envelope);
  assert.deepEqual([a.store.row.current.version, a.store.row.base.version, a.store.row.current.dirty], [2, 2, false]);
});

test('KM-006 AC24 FR19 both edited the same field: one merged copy, a conflict mark on that field, loser in history', async () => {
  const { a, b, item, id } = await synced();
  await a.session.mutate(setPass(item.id, 'from A'));
  await b.session.mutate(setPass(item.id, 'from B'));
  const r = await a.session.applyRemote(id, b.store.row.current.envelope, 2);
  assert.equal(r.dirty, true);
  const merged = a.session.vault.items[0];
  assert.deepEqual(merged.conflict.fields, [passOf(a.session.vault).id]);
  assert.ok(merged.history.some((h) => h.reason === 'conflict'));
  assert.deepEqual([a.store.row.current.dirty, a.store.row.current.version, a.store.row.base.version], [true, 2, 2]);
});

test('KM-006 AC30 FR26 a push whose answer was lost settles on the next pull: no mark, nothing to push', async () => {
  const { a, item, id } = await synced();
  await a.session.mutate(setPass(item.id, 'p1'));
  const onServer = a.store.row.current.envelope; // the server stored it, the 200 never arrived
  const r = await a.session.applyRemote(id, onServer, 2);
  assert.deepEqual(r, { changed: false, dirty: false });
  assert.equal(a.session.vault.items[0].conflict, null);
  assert.equal(a.store.row.current.dirty, false);
});

test('KM-006 AC34 FR23 a server copy that does not decrypt changes nothing and names the vault', async () => {
  const { a, item, id } = await synced();
  await a.session.mutate(setPass(item.id, 'mine'));
  const before = JSON.stringify(a.store.row);
  const bad = { ...a.store.row.current.envelope, ct: flipB64(a.store.row.current.envelope.ct, 30) };
  await assert.rejects(a.session.applyRemote(id, bad, 2), (e) => e.name === 'VaultError' && e.code === 'invalid-remote');
  assert.equal(JSON.stringify(a.store.row), before);
  assert.equal(passOf(a.session.vault).v, 'mine');
});

test('KM-006 plan decision 1 a server copy older than this device is refused, nothing written', async () => {
  const { a, b, item, id } = await synced();
  await a.session.commitPushed(id, a.store.row.current.envelope, 5);
  await b.session.mutate(setPass(item.id, 'old'));
  const before = JSON.stringify(a.store.row);
  await assert.rejects(a.session.applyRemote(id, b.store.row.current.envelope, 3), (e) => e.code === 'server-older');
  assert.equal(JSON.stringify(a.store.row), before);
});

test('KM-006 FR21 a sync result and a save never interleave: both survive', async () => {
  const { a, b, item, id } = await synced();
  await b.session.mutate((v, ctx) => updateItem(v, item.id, { notes: 'from B' }, ctx));
  const save = a.session.mutate((v, ctx) => createItem(v, 'note', { title: 'local' }, ctx));
  const pull = a.session.applyRemote(id, b.store.row.current.envelope, 2);
  await Promise.all([save, pull]);
  assert.ok(a.session.vault.items.some((i) => i.title === 'local'));
  assert.equal(a.session.vault.items[0].notes, 'from B');
  assert.equal(a.store.row.current.dirty, true);
});

test('KM-006 AC40 a lock during a sync job: LockedError, and the disk holds the old pair or the new one', async () => {
  const { a, b, item, id } = await synced();
  await b.session.mutate(setPass(item.id, 'from B'));
  const pull = a.session.applyRemote(id, b.store.row.current.envelope, 2);
  a.session.lock();
  await assert.rejects(pull, LockedError);
  const again = createSession({ store: a.store });
  await again.unlock(PW);
  assert.ok(['from B', ''].includes(passOf(again.vault).v));
});

test('KM-006 FR27 FR28 a vault from the server that does not open is kept and reported; the shown vault stays, unlock still works', async () => {
  const { a } = await synced();
  const shown = a.session.activeVaultId;
  // Wrapped under another account's key: the case of a vault this device cannot open.
  const other = await ready();
  const foreign = other.store.row;
  const added = await a.session.addRemoteVault({ id: '0000000000000001', wrappedVaultKey: foreign.wrappedVaultKey, meta: foreign.meta, metaVersion: 1, version: 1 }, foreign.current.envelope);
  assert.equal(added, false, 'wrapped under another account key: kept on disk, reported, not opened');
  assert.equal(a.session.activeVaultId, shown);
  assert.ok(a.store.rowOf('0000000000000001'));
  assert.deepEqual(a.session.vaults.find((x) => x.id === '0000000000000001').error, 'damaged');
  a.session.lock();
  const again = createSession({ store: a.store });
  await again.unlock(PW);
  assert.equal(again.activeVaultId, shown);
});

test('KM-006 FR28 an account from KM-003 has no saved choice: its only vault is shown', async () => {
  const { store } = await ready();
  const { activeVaultId, ...old } = store.account;
  const rows = store.rows.map((r) => structuredClone(r));
  const km003 = memoryStore();
  await km003.createAccount(old, rows);
  const session = createSession({ store: km003 });
  await session.unlock(PW);
  assert.equal(session.activeVaultId, activeVaultId);
  assert.equal(session.vaultMeta.name, DEFAULT_VAULT_NAME);
});

test('KM-006 FR28 with no saved choice: oldest createdAt, ties by id', async () => {
  assert.equal(pickActive(['b', 'a']), 'a');
  assert.equal(pickActive(['a', 'b'], new Map([['a', 5], ['b', 3]])), 'b');
  assert.equal(pickActive(['b', 'a'], new Map([['a', 3], ['b', 3]])), 'a');
  assert.equal(pickActive([]), null);
});

test('KM-006 FR27 a second vault made with the account key opens and syncs; the shown vault stays', async () => {
  const { a } = await synced();
  const shown = a.session.activeVaultId;
  const c = await import('../src/public/js/core/crypto.js');
  const { createVault } = await import('../src/public/js/core/model.js');
  const { encKey } = await c.deriveFromPassword(PW, a.store.account.kdf);
  const accountKey = await c.unwrapAccountKey(a.store.account.wrappedAccountKey, encKey);
  const id = '0000000000000002';
  const vaultKey = await c.generateVaultKey();
  const item = { id, wrappedVaultKey: await c.wrapVaultKey(vaultKey, accountKey, id), meta: await c.encryptVaultMeta({ name: 'Thứ hai', color: null, order: 1 }, vaultKey, id), metaVersion: 1, version: 1 };
  assert.equal(await a.session.addRemoteVault(item, await c.encryptVault(createVault(id), vaultKey)), true);
  assert.equal(a.session.activeVaultId, shown);
  assert.deepEqual(a.session.vaults.map((v) => v.name).sort(), ['Thứ hai', DEFAULT_VAULT_NAME].sort());
  assert.deepEqual([a.store.rowOf(id).current.dirty, a.store.rowOf(id).base.version], [false, 1]);
});
