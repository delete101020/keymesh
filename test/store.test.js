import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore, toRecord, newVaultRow, StoreError } from '../src/public/js/store.js';
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
  assert.deepEqual(Object.keys(account).sort(), ['deviceId', 'kdf', 'userId', 'username', 'wrappedAccountKey']);
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
