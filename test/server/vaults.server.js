// The vault API: lists, create, read, compare-and-swap, and the single 404.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { comparable, createAccount, newBlob, newMeta, newVault, newVaultId, newWrappedVaultKey, startServer } from '../../testkit/wrangler-server.mjs';

let server;
let alice;
let bob;
before(async () => {
  server = await startServer();
  alice = await createAccount(server);
  bob = await createAccount(server);
});
after(() => server.stop());

const list = (account, headers) => server.call('GET', '/api/vaults', { token: account.token, headers });
const create = (account, json) => server.call('POST', '/api/vaults', { token: account.token, json });
const read = (account, id, query = '') => server.call('GET', `/api/vaults/${id}${query}`, { token: account.token });
const write = (account, id, json) => server.call('PUT', `/api/vaults/${id}`, { token: account.token, json });
const row = (id) => server.sql('SELECT * FROM dt_vault WHERE id = ?', id)[0];
const assertNotFound = (response) => {
  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'not_found');
};

// A vault at the given version, written through the API.
async function vaultAt(account, version) {
  const vault = newVault();
  assert.equal((await create(account, vault)).status, 201);
  let blob = vault.blob;
  for (let v = 1; v < version; v++) {
    blob = newBlob();
    assert.equal((await write(account, vault.id, { baseVersion: v, blob })).status, 200);
  }
  return { ...vault, blob };
}

test('KM-005 AC36 each account lists only its own vaults, with the right size and no blob', async () => {
  const a = await createAccount(server);
  const b = await createAccount(server);
  const body = newVault({ blob: newBlob(1000) });
  assert.equal((await create(a, body)).status, 201);

  const mine = await list(a);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.items.map((v) => v.id).sort(), [a.vaultId, body.id].sort());
  const item = mine.body.items.find((v) => v.id === body.id);
  assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'id', 'meta', 'metaVersion', 'size', 'updatedAt', 'version', 'wrappedVaultKey']);
  assert.deepEqual(item.wrappedVaultKey, body.wrappedVaultKey);
  assert.deepEqual(item.meta, body.meta);
  assert.equal(item.size, Buffer.byteLength(JSON.stringify(body.blob)));
  assert.equal(item.size, row(body.id).size);
  assert.ok(!mine.text.includes('"blob"') && !mine.text.includes(body.blob.ct));

  const theirs = await list(b);
  assert.deepEqual(theirs.body.items.map((v) => v.id), [b.vaultId]);
});

test('KM-005 AC37 If-None-Match gets 304 until the list changes, in strong and weak form', async () => {
  const account = await createAccount(server);
  const first = await list(account);
  const etag = first.headers.get('etag');
  assert.match(etag, /^"[0-9a-f]{64}"$/);
  for (const value of [etag, `W/${etag}`, `"other", ${etag}`]) {
    const same = await list(account, { 'If-None-Match': value });
    assert.equal(same.status, 304, value);
    assert.equal(same.text, '');
    assert.equal(same.headers.get('etag'), etag);
    assert.equal(same.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await list(account, { 'If-None-Match': '"stale"' })).status, 200);

  assert.equal((await write(account, account.vaultId, { baseVersion: 1, blob: newBlob() })).status, 200);
  const afterWrite = await list(account, { 'If-None-Match': etag });
  assert.equal(afterWrite.status, 200);
  const etag2 = afterWrite.headers.get('etag');
  assert.notEqual(etag2, etag);
  assert.equal((await create(account, newVault())).status, 201);
  const afterCreate = await list(account, { 'If-None-Match': etag2 });
  assert.equal(afterCreate.status, 200);
  assert.notEqual(afterCreate.headers.get('etag'), etag2);
});

test('KM-005 AC38 creating a vault gives 201 at version 1; another device sees it', async () => {
  const account = await createAccount(server);
  const other = await server.call('POST', '/api/login', { json: { username: account.username, authKey: account.authKey } });
  const body = newVault();
  const response = await create(account, body);
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { id: body.id, version: 1, metaVersion: 1 });
  const seen = await server.call('GET', '/api/vaults', { token: other.body.token });
  const item = seen.body.items.find((v) => v.id === body.id);
  assert.equal(item.version, 1);
  assert.equal(item.metaVersion, 1);
});

test('KM-005 AC39 an id already in use, by anyone, is 409 and the vault stays as it was', async () => {
  const account = await createAccount(server);
  const other = await createAccount(server);
  for (const id of [account.vaultId, other.vaultId]) {
    const before = row(id);
    const response = await create(account, newVault({ id }));
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'vault_exists');
    assert.deepEqual(row(id), before);
  }
});

const BAD_BLOBS = [
  (b) => ({ ...b, extra: 1 }),
  (b) => ({ format: b.format, v: b.v, alg: b.alg, iv: b.iv }),
  (b) => ({ v: b.v, alg: b.alg, iv: b.iv, ct: b.ct }),
  (b) => ({ ...b, format: 'other' }),
  (b) => ({ ...b, v: 1 }),
  (b) => ({ ...b, v: '2' }),
  (b) => ({ ...b, alg: 'AES-CBC' }),
  (b) => ({ ...b, iv: Buffer.alloc(11).toString('base64') }),
  (b) => ({ ...b, iv: Buffer.alloc(13).toString('base64') }),
  (b) => ({ ...b, iv: 12 }),
  (b) => ({ ...b, iv: 1234567890123456 }), // 16 digits: a regex alone would coerce and accept it
  (b) => ({ ...b, ct: '' }),
  (b) => ({ ...b, ct: 'abc' }),
  (b) => ({ ...b, ct: 'not base64!!' }),
  (b) => ({ ...b, ct: 7 }),
  () => null,
  () => 'blob',
  () => [],
];

test('KM-005 AC40 a malformed blob is invalid_envelope on create and write, and nothing changes', async () => {
  const account = await createAccount(server);
  const before = row(account.vaultId);
  const vaults = () => server.sql('SELECT count(*) AS n FROM dt_vault')[0].n;
  const total = vaults();
  for (const damage of BAD_BLOBS) {
    const blob = damage(newBlob());
    for (const response of [await create(account, newVault({ blob })), await write(account, account.vaultId, { baseVersion: 1, blob })]) {
      assert.equal(response.status, 400, JSON.stringify(blob));
      assert.equal(response.body.error, 'invalid_envelope');
    }
  }
  assert.deepEqual(row(account.vaultId), before);
  assert.equal(vaults(), total);
});

test('KM-005 AC41 meta or wrappedVaultKey with extra fields, or by other than account, is bad_request', async () => {
  const account = await createAccount(server);
  const bad = [
    { meta: { ...newMeta(), extra: 1 } },
    { meta: { iv: newMeta().iv } },
    { meta: null },
    { wrappedVaultKey: { ...newWrappedVaultKey(), extra: 1 } },
    { wrappedVaultKey: { ...newWrappedVaultKey(), by: 'password' } },
    { wrappedVaultKey: { iv: newMeta().iv, ct: newMeta().ct } },
    { wrappedVaultKey: undefined },
  ];
  for (const over of bad) {
    const response = await create(account, newVault(over));
    assert.equal(response.status, 400, JSON.stringify(over));
    assert.equal(response.body.error, 'bad_request');
  }
  for (const id of ['ABCDEF0123456789', 'abc', '0123456789abcdefg']) {
    const response = await create(account, newVault({ id }));
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'invalid_id');
  }
  assert.equal((await create(account, newVault({ id: 42 }))).body.error, 'bad_request');
  for (const raw of ['{broken', '[]', 'null', '']) {
    assert.equal((await server.call('POST', '/api/vaults', { token: account.token, raw })).body.error, 'bad_request');
  }
});

test('KM-005 AC42 a blob written is read back identical', async () => {
  const account = await createAccount(server);
  const blob = newBlob(5000);
  assert.equal((await write(account, account.vaultId, { baseVersion: 1, blob })).status, 200);
  const response = await read(account, account.vaultId);
  assert.deepEqual(response.body.blob, blob);
  assert.deepEqual(Object.keys(response.body).sort(), ['blob', 'updatedAt', 'version']);
  assert.equal(response.body.version, 2);
});

test('KM-005 AC43 since: equal is 304, anything else 200, garbage 400', async () => {
  const account = await createAccount(server);
  const vault = await vaultAt(account, 8);
  const at = (query) => read(account, vault.id, query);
  const same = await at('?since=8');
  assert.equal(same.status, 304);
  assert.equal(same.text, '');
  assert.equal((await at('?since=7')).status, 200);
  assert.equal((await at('?since=99')).status, 200);
  assert.deepEqual((await at('?since=99')).body.blob, vault.blob);
  assert.equal((await at('')).status, 200);
  for (const garbage of ['abc', '', '-1', '1.5', '8x', '1e1', ' 8']) {
    const response = await at(`?since=${encodeURIComponent(garbage)}`);
    assert.equal(response.status, 400, garbage);
    assert.equal(response.body.error, 'bad_request');
  }
});

test('KM-005 AC44 writing at the current version stores the blob and adds exactly 1', async () => {
  const account = await createAccount(server);
  const vault = await vaultAt(account, 8);
  const blob = newBlob();
  const response = await write(account, vault.id, { baseVersion: 8, blob });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['updatedAt', 'version']);
  assert.equal(response.body.version, 9);
  const back = await read(account, vault.id);
  assert.deepEqual(back.body.blob, blob);
  assert.equal(back.body.updatedAt, response.body.updatedAt);
  assert.equal(row(vault.id).size, Buffer.byteLength(JSON.stringify(blob)));
});

test('KM-005 AC45 writing from any other version is version_conflict with the current state, changing nothing', async () => {
  const account = await createAccount(server);
  const vault = await vaultAt(account, 9);
  const before = row(vault.id);
  for (const baseVersion of [8, 10, 0]) {
    const response = await write(account, vault.id, { baseVersion, blob: newBlob() });
    assert.equal(response.status, 409, `base ${baseVersion}`);
    assert.equal(response.body.error, 'version_conflict');
    assert.equal(typeof response.body.message, 'string');
    assert.equal(response.body.version, 9);
    assert.equal(response.body.updatedAt, before.updated_at);
    assert.deepEqual(response.body.blob, vault.blob);
  }
  assert.deepEqual(row(vault.id), before);
  for (const baseVersion of [undefined, '9', 8.5, -1, null]) {
    const response = await write(account, vault.id, { baseVersion, blob: newBlob() });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'bad_request');
  }
  assert.deepEqual(row(vault.id), before);
});

test('KM-005 AC46 NFR05 10 parallel writes from one version: exactly one wins and the version adds 1', async () => {
  const account = await createAccount(server);
  const vault = await vaultAt(account, 3);
  const blobs = Array.from({ length: 10 }, () => newBlob());
  const responses = await Promise.all(blobs.map((blob) => write(account, vault.id, { baseVersion: 3, blob })));
  const statuses = responses.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 200).length, 1, statuses.join());
  assert.equal(statuses.filter((s) => s === 409).length, 9, statuses.join());
  const winner = blobs[statuses.indexOf(200)];
  assert.equal(row(vault.id).version, 4);
  assert.deepEqual((await read(account, vault.id)).body.blob, winner);
  for (const lost of responses.filter((r) => r.status === 409)) assert.deepEqual(lost.body.blob, winner);
});

test('KM-005 AC47 FR31 someone else\'s vault and no vault at all are byte-identical 404s; the owner\'s data is untouched', async () => {
  const theirs = alice.vaultId;
  const none = newVaultId();
  const before = row(theirs);
  const pairs = [
    (id) => read(bob, id),
    (id) => read(bob, id, '?since=1'),
    (id) => read(bob, id, '?since=abc'),
    (id) => write(bob, id, { baseVersion: 1, blob: newBlob() }),
    (id) => write(bob, id, { baseVersion: 99, blob: { nonsense: true } }),
    (id) => server.call('PUT', `/api/vaults/${id}`, { token: bob.token, raw: '{broken' }),
  ];
  for (const send of pairs) {
    const a = await send(theirs);
    const b = await send(none);
    assertNotFound(a);
    assert.deepEqual(comparable(a), comparable(b));
  }
  assert.deepEqual(row(theirs), before);
});

test('KM-005 AC48 FR32 an id of the wrong form is invalid_id once the token has passed', async () => {
  for (const id of ['0123456789abcde', '0123456789abcdef0', '0123456789ABCDEF', '0123456789abcdeg', 'a%20b', '..%2F..%2Fapi']) {
    for (const response of [await read(alice, id), await write(alice, id, { baseVersion: 1, blob: newBlob() }), await server.call('PUT', `/api/vaults/${id}`, { token: alice.token, raw: '{broken' })]) {
      assert.equal(response.status, 400, id);
      assert.equal(response.body.error, 'invalid_id');
    }
  }
});

test('KM-005 AC09 FR05 a write within the body limit whose row would not fit is 413, not 500', async () => {
  const account = await createAccount(server);
  const before = row(account.vaultId);
  const shell = { baseVersion: 1, blob: newBlob(16) };
  const room = 2_000_000 - JSON.stringify(shell).length;
  const ct = 'A'.repeat(Math.floor((shell.blob.ct.length + room) / 4) * 4);
  const json = { baseVersion: 1, blob: { ...shell.blob, ct } };
  assert.ok(JSON.stringify(json).length <= 2_000_000);
  const response = await write(account, account.vaultId, json);
  assert.equal(response.status, 413);
  assert.equal(response.body.error, 'too_large');
  assert.deepEqual(row(account.vaultId), before);

  // Just under the row limit a large blob is stored and comes back whole.
  const fits = { ...shell.blob, ct: 'A'.repeat(1_900_000) };
  assert.equal((await write(account, account.vaultId, { baseVersion: 1, blob: fits })).status, 200);
  assert.deepEqual((await read(account, account.vaultId)).body.blob, fits);
});

test('KM-005 NFR06 storage failing on create or write is 500 and leaves the data as it was', async () => {
  const account = await createAccount(server);
  const before = row(account.vaultId);
  const total = server.sql('SELECT count(*) AS n FROM dt_vault')[0].n;
  server.exec(`CREATE TRIGGER no_vault_insert BEFORE INSERT ON dt_vault BEGIN SELECT RAISE(ABORT, 'storage down'); END;
               CREATE TRIGGER no_vault_update BEFORE UPDATE ON dt_vault BEGIN SELECT RAISE(ABORT, 'storage down'); END;`);
  const responses = [await create(account, newVault()), await write(account, account.vaultId, { baseVersion: 1, blob: newBlob() })];
  server.exec('DROP TRIGGER no_vault_insert; DROP TRIGGER no_vault_update;');
  for (const response of responses) {
    assert.equal(response.status, 500);
    assert.deepEqual(Object.keys(response.body).sort(), ['error', 'message']);
    assert.equal(response.body.error, 'internal');
  }
  assert.deepEqual(row(account.vaultId), before);
  assert.equal(server.sql('SELECT count(*) AS n FROM dt_vault')[0].n, total);
});
