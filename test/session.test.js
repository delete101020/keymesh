import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, LockedError, DEFAULT_VAULT_NAME } from '../src/public/js/session.js';
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
