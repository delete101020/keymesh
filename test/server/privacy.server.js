// What ends up on the server's disk and in its logs. Each scan has a positive control, so a scanner that
// reads nothing cannot pass by accident.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { VECTORS } from '../../testkit/vectors.js';
import { REGISTRATION_TOKEN, SERVER_SECRET, byteForms, createAccount, newAuthKey, newBlob, newVault, startServer, stringForms, uniqueIp, uniqueName } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const fromB64 = (value) => Buffer.from(value, 'base64');
const fromHex = (value) => Buffer.from(value, 'hex');

// Every file below the data directory, WAL included.
async function allFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) files.push({ path: join(entry.parentPath, entry.name), bytes: await readFile(join(entry.parentPath, entry.name)) });
  }
  return files;
}

// Which of the named values occur, as bytes, in any file: `{ label: [Buffer | string, ...] }`.
function occurrences(files, wanted) {
  const found = [];
  for (const [label, forms] of Object.entries(wanted)) {
    for (const form of forms) {
      const needle = Buffer.isBuffer(form) ? form : Buffer.from(form);
      if (files.some((file) => file.bytes.includes(needle))) found.push(label);
    }
  }
  return found;
}

const secretForms = (bytes) => [bytes, ...byteForms(bytes)];

test('KM-005 AC49 FR33 after the whole chain, failures and overwrites, snapshots and audit are empty; counters are not', async () => {
  const account = await createAccount(server);
  let version = 1;
  for (let i = 0; i < 5; i++) {
    const response = await server.call('PUT', `/api/vaults/${account.vaultId}`, { token: account.token, json: { baseVersion: version, blob: newBlob() } });
    version = response.body.version;
  }
  await server.call('PUT', `/api/vaults/${account.vaultId}`, { token: account.token, json: { baseVersion: 1, blob: newBlob() } });
  const ip = uniqueIp();
  for (let i = 0; i < 6; i++) await server.call('POST', '/api/login', { json: { username: account.username, authKey: newAuthKey() }, ip });
  await server.call('POST', '/api/logout', { token: account.token });
  assert.equal(server.sql('SELECT count(*) AS n FROM dt_vault_snapshot')[0].n, 0);
  assert.equal(server.sql('SELECT count(*) AS n FROM dt_audit_log')[0].n, 0);
  assert.ok(server.sql('SELECT count(*) AS n FROM sys_auth_attempt')[0].n >= 2);
});

test('KM-005 AC50 NFR01 nothing readable is on disk: no password, plaintext, key or token, in any form', async () => {
  const username = uniqueName('vector');
  const body = {
    registrationToken: REGISTRATION_TOKEN,
    username,
    kdf: VECTORS.inputs.kdf,
    authKey: fromHex(VECTORS.authKey).toString('base64'),
    wrappedAccountKey: VECTORS.wrappedAccountKeyByEnc,
    vault: { id: VECTORS.inputs.vaultId, wrappedVaultKey: VECTORS.wrappedVaultKey, meta: VECTORS.meta, blob: VECTORS.envelope },
    deviceName: 'Vector device',
  };
  const registered = await server.call('POST', '/api/register', { json: body });
  assert.equal(registered.status, 201, registered.text);
  const login = await server.call('POST', '/api/login', { json: { username, authKey: body.authKey }, ip: uniqueIp() });
  assert.equal(login.status, 200);
  const created = newVault();
  const tokens = [registered.body.token, login.body.token];
  assert.equal((await server.call('POST', '/api/vaults', { token: tokens[1], json: created })).status, 201);
  assert.equal((await server.call('PUT', `/api/vaults/${VECTORS.inputs.vaultId}`, { token: tokens[1], json: { baseVersion: 1, blob: VECTORS.envelope } })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 100));

  const files = await allFiles(server.dataDir);
  assert.ok(files.length > 0);
  const { inputs, derived } = VECTORS;
  const found = occurrences(files, {
    password: stringForms(inputs.password),
    masterKey: secretForms(fromHex(derived.masterKey)),
    encKey: secretForms(fromHex(derived.encKey)),
    prfKey: secretForms(fromHex(derived.prfKey)),
    authKey: secretForms(fromHex(VECTORS.authKey)),
    accountKey: secretForms(fromB64(inputs.accountKey)),
    vaultKey: secretForms(fromB64(inputs.vaultKey)),
    'item title': stringForms(inputs.vault.items[0].title),
    'item secret': stringForms(inputs.vault.items[0].fields[1].v),
    'project name': stringForms(inputs.vault.projects[0].name),
    'vault name': stringForms(inputs.meta.name),
    'token 1': stringForms(tokens[0]),
    'token 2': stringForms(tokens[1]),
    'registration token': stringForms(REGISTRATION_TOKEN),
    'server secret': stringForms(SERVER_SECRET),
  });
  assert.deepEqual(found, []);

  // Control: the same scan does find what the server is meant to keep.
  assert.deepEqual(occurrences(files, { ct: [VECTORS.envelope.ct], name: [username], salt: [inputs.kdf.salt] }), ['ct', 'name', 'salt']);
  assert.equal(server.sql('SELECT auth_hash FROM dt_user WHERE username = ?', username)[0].auth_hash, createHash('sha256').update(fromHex(VECTORS.authKey)).digest('base64'));
});

test('KM-005 AC51 NFR02 failed attempts leave neither the username nor the IP, not even as a raw hash', async () => {
  const username = uniqueName('stranger-TYPED-PASSWORD');
  const ip = '198.18.77.123';
  const sha = (text, encoding) => createHash('sha256').update(text).digest(encoding);
  const before = server.sql('SELECT count(*) AS n FROM sys_auth_attempt')[0].n;
  for (let i = 0; i < 3; i++) {
    assert.equal((await server.call('POST', '/api/login', { json: { username, authKey: newAuthKey() }, ip })).status, 401);
  }
  assert.equal(server.sql('SELECT count(*) AS n FROM sys_auth_attempt')[0].n, before + 2, 'the two counters exist');

  const forms = (value) => [value, value.toLowerCase(), ...stringForms(value), sha(value), sha(value, 'hex'), sha(value, 'base64')];
  const keys = server.sql('SELECT key FROM sys_auth_attempt').map((row) => row.key);
  for (const form of [...forms(username), ...forms(ip), ...forms(`u:${username}`), ...forms(`ip:${ip}`)]) {
    if (Buffer.isBuffer(form)) continue;
    assert.ok(!keys.some((key) => key.includes(form)));
  }
  const found = occurrences(await allFiles(server.dataDir), { username: forms(username), 'username lower': forms(username.toLowerCase()), ip: forms(ip) });
  assert.deepEqual(found, []);
});

test('KM-005 AC52 NFR03 the scan of server output sees the output and finds no secret or blob', async () => {
  const own = await startServer();
  const account = await createAccount(own);
  const login = await own.call('POST', '/api/login', { json: { username: account.username, authKey: account.authKey } });
  assert.equal(login.status, 200);
  own.exec(`CREATE TRIGGER fail_all BEFORE UPDATE ON dt_vault BEGIN SELECT RAISE(ABORT, 'storage down'); END;`);
  const blob = newBlob();
  assert.equal((await own.call('PUT', `/api/vaults/${account.vaultId}`, { token: account.token, json: { baseVersion: 1, blob } })).status, 500);
  own.exec('DROP TRIGGER fail_all');
  assert.ok(own.needles.has(blob.ct) && own.needles.has(account.authKey) && own.needles.has(login.body.token), 'the scan is looking for them');

  const logs = await own.stop(); // throws if any value reached the logs
  assert.match(logs, /Ready on http/, 'wrangler output is captured');
  assert.match(logs, /api: internal error/, "the Function's console is captured");
  assert.ok(!logs.includes('storage down'), 'the driver message is not logged');
});
