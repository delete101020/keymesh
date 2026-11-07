import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore, toRecord, newVaultRow, syncedVaultRow, StoreError } from '../src/public/js/store.js';
import { createSession } from '../src/public/js/session.js';
import { createAccount, deriveFromPassword, unlockWithPassword } from '../src/public/js/core/crypto.js';
import { createItem, validateVault } from '../src/public/js/core/model.js';
import { isNode } from '../testkit/helpers.js';

const PW = 'store test password';
const skip = isNode ? 'IndexedDB exists only in the browser runner' : false;

function wipe() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('keymesh');
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    req.onblocked = resolve;
  });
}

async function freshStore() {
  await wipe();
  return openStore();
}

test('KM-003 AC03 FR03 FR04 account and vault rows have the shape of docs/03 §3', { skip }, async () => {
  const store = await freshStore();
  const session = createSession({ store });
  assert.equal(await session.hasAccount(), false);
  await session.createAccount(PW);
  assert.equal(await session.hasAccount(), true);
  const account = await store.readAccount();
  // activeVaultId: KM-006 FR28. Accounts written before it lack the key and show their only vault.
  assert.deepEqual(Object.keys(account).sort(), ['activeVaultId', 'deviceId', 'kdf', 'userId', 'username', 'wrappedAccountKey']);
  assert.equal(account.userId, null);
  assert.equal(account.username, null);
  const rows = await store.readVaultRows();
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['base', 'current', 'deletedAt', 'id', 'meta', 'metaVersion', 'wrappedVaultKey']);
  assert.deepEqual(Object.keys(rows[0].current).sort(), ['dirty', 'envelope', 'savedAt', 'version']);
  assert.equal(rows[0].current.dirty, true);
  store.close();
});

test('KM-003 AC04 FR03 an account write that fails midway leaves nothing behind', { skip }, async () => {
  const store = await freshStore();
  const created = await createAccount(PW, { meta: { name: 'x', color: null, order: 0 } });
  const good = newVaultRow(created.records[0], 1);
  const account = { userId: null, username: null, kdf: created.kdf, wrappedAccountKey: created.wrappedAccountKey, deviceId: 'd_0000000000000001' };
  // A second row with the same key aborts the transaction after the account has been added.
  await assert.rejects(store.createAccount(account, [good, good]), StoreError);
  assert.equal(await store.readAccount(), null);
  assert.deepEqual(await store.readVaultRows(), []);
  // A throw in our own code after the first add must abort too, not commit half an account.
  const realAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function add(value, key) {
    if (this.name === 'vaults') throw new DOMException('quota', 'QuotaExceededError');
    return realAdd.call(this, value, key);
  };
  try {
    await assert.rejects(store.createAccount(account, [good]), StoreError);
  } finally {
    IDBObjectStore.prototype.add = realAdd;
  }
  assert.equal(await store.readAccount(), null);
  await store.createAccount(account, [good]);
  await assert.rejects(store.createAccount(account, [good]), StoreError);
  assert.equal((await store.readVaultRows()).length, 1);
  store.close();
});

test('KM-003 AC20 FR23 a failed put changes nothing on disk', { skip }, async () => {
  const store = await freshStore();
  const session = createSession({ store });
  await session.createAccount(PW);
  const before = JSON.stringify(await store.readVaultRows());
  const realPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function put() {
    throw new DOMException('quota', 'QuotaExceededError');
  };
  try {
    await assert.rejects(session.mutate((v, ctx) => createItem(v, 'note', { title: 'never' }, ctx)), StoreError);
  } finally {
    IDBObjectStore.prototype.put = realPut;
  }
  assert.equal(JSON.stringify(await store.readVaultRows()), before);
  assert.equal(session.vault.items.length, 0);
  store.close();
});

test('KM-003 AC53 FR04 a stored row opens with the password and maps onto POST /api/register', { skip }, async () => {
  const store = await freshStore();
  const session = createSession({ store });
  await session.createAccount(PW);
  await session.mutate((v, ctx) => createItem(v, 'note', { title: 'kept' }, ctx));
  const account = await store.readAccount();
  const rows = await store.readVaultRows();
  const { vaults } = await unlockWithPassword(PW, account.kdf, account.wrappedAccountKey, rows.map(toRecord));
  assert.equal(vaults[0].vault.items[0].title, 'kept');
  assert.deepEqual(validateVault(vaults[0].vault), { ok: true });
  // docs/06 POST /api/register: everything comes from the stored rows; authKey is derived again.
  const { authKey } = await deriveFromPassword(PW, account.kdf);
  const vault = { id: rows[0].id, wrappedVaultKey: rows[0].wrappedVaultKey, meta: rows[0].meta, blob: rows[0].current.envelope };
  assert.equal(authKey.length, 32);
  assert.ok(vault.id && vault.wrappedVaultKey.ct && vault.meta.ct && vault.blob.ct);
  assert.equal(rows[0].current.dirty, true);
  store.close();
  await wipe();
});

test('KM-003 FR08 a missing IndexedDB is reported, not thrown as a TypeError', async () => {
  await assert.rejects(openStore(null), StoreError);
});

test('KM-004 AC07 settings live in meta.settings next to the account and survive a new connection', { skip }, async () => {
  const store = await freshStore();
  assert.equal(await store.readSettings(), null);
  await store.writeSettings({ idleMs: 60000, backgroundMs: 0, recents: ['i_a'] });
  store.close();
  const again = await openStore();
  assert.deepEqual(await again.readSettings(), { idleMs: 60000, backgroundMs: 0, recents: ['i_a'] });
  assert.equal(await again.readAccount(), null);
  again.close();
});

// --- KM-006 ------------------------------------------------------------------------------------------

async function registeredStore() {
  const store = await freshStore();
  const session = createSession({ store });
  await session.createAccount(PW);
  await session.mutate((v, ctx) => createItem(v, 'note', { title: 'kept' }, ctx));
  return { store, session, id: session.activeVaultId };
}

test('KM-006 FR04 FR18 commitRegistration and commitPush: version moves, dirty clears only when nothing newer was saved', { skip }, async () => {
  const { store, session, id } = await registeredStore();
  const sent = (await store.readVaultRow(id)).current.envelope;
  await session.mutate((v, ctx) => createItem(v, 'note', { title: 'while registering' }, ctx));
  await store.commitRegistration({ userId: 'u_1', username: 'kf', session: { token: 't', expiresAt: 1 }, vaultId: id, sent, version: 1, metaVersion: 1 });
  let row = await store.readVaultRow(id);
  assert.deepEqual([row.current.version, row.current.dirty, row.base.version, row.metaVersion], [1, true, 1, 1]);
  assert.deepEqual(row.base.envelope, sent);
  assert.deepEqual(await store.readSession(), { token: 't', expiresAt: 1 });
  assert.equal((await store.readAccount()).username, 'kf');
  await store.commitPush(id, row.current.envelope, 2);
  row = await store.readVaultRow(id);
  assert.deepEqual([row.current.version, row.current.dirty, row.base.version], [2, false, 2]);
  store.close();
});

test('KM-006 FR20 commitPull writes current and base together; addVaultRow never overwrites', { skip }, async () => {
  const { store, id } = await registeredStore();
  const row = await store.readVaultRow(id);
  await store.commitPull(id, { envelope: row.current.envelope, dirty: false, base: { envelope: row.current.envelope, version: 7 }, savedAt: 5 });
  const after = await store.readVaultRow(id);
  assert.deepEqual([after.current.version, after.current.dirty, after.base.version, after.current.savedAt], [7, false, 7, 5]);
  const fresh = syncedVaultRow({ id: '0000000000000009', wrappedVaultKey: row.wrappedVaultKey, meta: row.meta, metaVersion: 1, version: 3, blob: row.current.envelope }, 1);
  await store.addVaultRow(fresh);
  await assert.rejects(store.addVaultRow(fresh), StoreError);
  assert.equal((await store.readVaultRows()).length, 2);
  store.close();
});

test('KM-006 FR11 FR25 session row: written, marked for login again, cleared; account patch', { skip }, async () => {
  const { store } = await registeredStore();
  assert.equal(await store.readSession(), null);
  await store.writeSession({ token: 'x', expiresAt: 1 });
  await store.writeSession({ token: null, needsLogin: true });
  assert.deepEqual(await store.readSession(), { token: null, needsLogin: true });
  await store.updateAccount({ username: 'kf' }, { token: 'y', expiresAt: 2 });
  assert.equal((await store.readAccount()).username, 'kf');
  assert.equal((await store.readSession()).token, 'y');
  await store.clearSession();
  assert.equal(await store.readSession(), null);
  store.close();
});

test('KM-006 FR13 wipe empties both stores in one go, even with another connection open', { skip }, async () => {
  const { store } = await registeredStore();
  await store.writeSettings({ idleMs: 60000, backgroundMs: 0, recents: ['i_a'] });
  await store.writeSession({ token: 'x', expiresAt: 1 });
  const otherTab = await openStore();
  await store.writeSession({ token: 'x', expiresAt: 1 });
  assert.equal(await store.hasPasskey(), false);
  await store.wipe();
  for (const s of [store, otherTab]) {
    assert.equal(await s.readAccount(), null);
    assert.equal(await s.readSession(), null);
    assert.equal(await s.readSettings(), null);
    assert.deepEqual(await s.readVaultRows(), []);
  }
  otherTab.close();
  store.close();
});

test('KM-006 FR09 replaceAccount swaps the account in one transaction; a failure keeps the old one', { skip }, async () => {
  const { store, id } = await registeredStore();
  const old = await store.readAccount();
  const row = await store.readVaultRow(id);
  const next = syncedVaultRow({ id: '000000000000000b', wrappedVaultKey: row.wrappedVaultKey, meta: row.meta, metaVersion: 1, version: 4, blob: row.current.envelope }, 1);
  const account = { ...old, userId: 'u_b', username: 'b', deviceId: 'd_000000000000000b' };
  await assert.rejects(store.replaceAccount(account, [next, next], { token: 't', expiresAt: 1 }), StoreError);
  assert.deepEqual(await store.readAccount(), old);
  await store.replaceAccount(account, [next], { token: 't', expiresAt: 1 });
  assert.equal((await store.readAccount()).username, 'b');
  assert.deepEqual((await store.readVaultRows()).map((r) => r.id), ['000000000000000b']);
  store.close();
  await wipe();
});
