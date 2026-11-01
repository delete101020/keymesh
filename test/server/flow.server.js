// Two devices through the whole of spec §3.1, then an account made by the KM-001 core and opened elsewhere.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { toBase64 } from '../../src/public/js/core/bytes.js';
import { createAccount as createCoreAccount, encryptVault, unlockWithPassword } from '../../src/public/js/core/crypto.js';
import { REGISTRATION_TOKEN, createAccount, newBlob, newVault, startServer, uniqueIp, uniqueName } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

test('KM-005 AC01 FR34 register, a second device, list, create, read, write, conflict, logout', async () => {
  // 1. Device A registers with keys it already has.
  const a = await createAccount(server, { deviceName: 'A' });
  const firstRead = await server.call('GET', `/api/vaults/${a.vaultId}`, { token: a.token });
  assert.equal(firstRead.status, 200);
  assert.equal(firstRead.body.version, 1);
  assert.deepEqual(firstRead.body.blob, a.blob);

  // 2. Device B asks for the kdf, logs in, gets its own token; A keeps working.
  const pre = await server.call('GET', `/api/prelogin?username=${a.username}`);
  assert.deepEqual(pre.body.kdf, a.kdf);
  const login = await server.call('POST', '/api/login', { json: { username: a.username, authKey: a.authKey, deviceName: 'B' } });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body.wrappedAccountKey, a.wrappedAccountKey);
  const b = login.body.token;
  assert.notEqual(b, a.token);
  assert.equal((await server.call('GET', '/api/vaults', { token: a.token })).status, 200);

  // 3. B lists, creates a vault, reads; since at the current version is 304.
  const second = newVault();
  assert.equal((await server.call('POST', '/api/vaults', { token: b, json: second })).status, 201);
  const list = await server.call('GET', '/api/vaults', { token: b });
  assert.deepEqual(list.body.items.map((v) => v.id).sort(), [a.vaultId, second.id].sort());
  for (const item of list.body.items) {
    assert.equal(item.blob, undefined);
    assert.ok(item.wrappedVaultKey && item.meta);
  }
  const read = await server.call('GET', `/api/vaults/${second.id}`, { token: b });
  assert.deepEqual(read.body.blob, second.blob);
  assert.equal((await server.call('GET', `/api/vaults/${second.id}?since=1`, { token: b })).status, 304);

  // 4. Both at one version: A wins, B gets A's blob back and writes on top of it.
  let version = 1;
  for (; version < 8; version++) {
    assert.equal((await server.call('PUT', `/api/vaults/${a.vaultId}`, { token: a.token, json: { baseVersion: version, blob: newBlob() } })).body.version, version + 1);
  }
  const blobA = newBlob();
  const writeA = await server.call('PUT', `/api/vaults/${a.vaultId}`, { token: a.token, json: { baseVersion: 8, blob: blobA } });
  assert.equal(writeA.status, 200);
  assert.equal(writeA.body.version, 9);
  const blobB = newBlob();
  const conflict = await server.call('PUT', `/api/vaults/${a.vaultId}`, { token: b, json: { baseVersion: 8, blob: blobB } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'version_conflict');
  assert.equal(conflict.body.version, 9);
  assert.deepEqual(conflict.body.blob, blobA);
  const retry = await server.call('PUT', `/api/vaults/${a.vaultId}`, { token: b, json: { baseVersion: 9, blob: blobB } });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.version, 10);

  // 5. A logs out; B is unaffected.
  assert.equal((await server.call('POST', '/api/logout', { token: a.token })).status, 204);
  assert.equal((await server.call('GET', '/api/vaults', { token: a.token })).status, 401);
  assert.equal((await server.call('GET', '/api/vaults', { token: b })).status, 200);
});

test('KM-005 AC02 FR14 keys and vault made by the core register as they are and open on another device', async () => {
  const password = 'mật khẩu của thiết bị A 🔐';
  const mark = uniqueName('MARKER');
  const core = await createCoreAccount(password);
  const [record] = core.records;
  const opened = core.vaults[0];
  const vault = { ...opened.vault, projects: [{ ...(opened.vault.projects[0] ?? {}), id: 'p_8f3a000000000001', name: mark, order: 0 }] };
  const envelope = await encryptVault(vault, opened.vaultKey);

  const username = uniqueName('core');
  const registered = await server.call('POST', '/api/register', {
    json: {
      registrationToken: REGISTRATION_TOKEN,
      username,
      kdf: core.kdf,
      authKey: toBase64(core.authKey),
      wrappedAccountKey: core.wrappedAccountKey,
      vault: { id: record.vaultId, wrappedVaultKey: record.wrappedVaultKey, meta: record.meta, blob: envelope },
    },
  });
  assert.equal(registered.status, 201, registered.text);

  // The other device knows only the username and the password.
  const { kdf } = (await server.call('GET', `/api/prelogin?username=${username}`)).body;
  assert.deepEqual(kdf, core.kdf);
  const login = await server.call('POST', '/api/login', { json: { username, authKey: toBase64(core.authKey) }, ip: uniqueIp() });
  assert.equal(login.status, 200);
  const token = login.body.token;
  const { items } = (await server.call('GET', '/api/vaults', { token })).body;
  const records = [];
  for (const item of items) {
    const { blob } = (await server.call('GET', `/api/vaults/${item.id}`, { token })).body;
    records.push({ vaultId: item.id, wrappedVaultKey: item.wrappedVaultKey, meta: item.meta, envelope: blob });
  }
  const unlocked = await unlockWithPassword(password, kdf, login.body.wrappedAccountKey, records);
  assert.equal(unlocked.vaults.length, 1);
  assert.equal(unlocked.vaults[0].ok, true);
  assert.deepEqual(unlocked.vaults[0].vault, vault);
  assert.deepEqual(unlocked.vaults[0].meta, opened.meta);
  await assert.rejects(unlockWithPassword('sai mật khẩu', kdf, login.body.wrappedAccountKey, records), { code: 'decrypt-failed' });
});
