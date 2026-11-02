// Prelogin and registration.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRATION_TOKEN, comparable, createAccount, newBlob, newVault, registerBody, startServer, uniqueName } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const count = (table) => server.sql(`SELECT count(*) AS n FROM ${table}`)[0].n;
const counts = () => ['dt_user', 'dt_vault', 'dt_session'].map(count);
const prelogin = (username) => server.call('GET', `/api/prelogin?username=${encodeURIComponent(username)}`);
const register = (over) => server.call('POST', '/api/register', { json: registerBody(over) });

const BAD_USERNAMES = ['', 'có-dấu', 'a b', 'a/b', 'a'.repeat(65), 'quote"', "tick'", 'percent%', 'semi;colon'];

test('KM-005 AC10 a username outside the rule is 400 at prelogin and register; 64 characters are taken', async () => {
  for (const username of BAD_USERNAMES) {
    const viaPrelogin = await prelogin(username);
    assert.equal(viaPrelogin.status, 400, username);
    assert.equal(viaPrelogin.body.error, 'bad_request');
    const viaRegister = await register({ username });
    assert.equal(viaRegister.status, 400, username);
    assert.equal(viaRegister.body.error, 'bad_request');
  }
  assert.equal((await server.call('GET', '/api/prelogin')).status, 400);
  const long = `${uniqueName('L')}${'a'.repeat(64)}`.slice(0, 64);
  assert.equal((await prelogin(long)).status, 200);
  assert.equal((await register({ username: long })).status, 201);
  assert.equal((await register({ username: `Aa0.-_@+${uniqueName('x')}` })).status, 201);
});

test('KM-005 AC11 a real username gets its stored kdf, in any case', async () => {
  const account = await createAccount(server, { username: `Mixed-${uniqueName()}` });
  for (const form of [account.username, account.username.toLowerCase(), account.username.toUpperCase()]) {
    const response = await prelogin(form);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { kdf: account.kdf });
  }
  const stored = server.sql('SELECT username FROM dt_user WHERE id = ?', account.userId)[0].username;
  assert.equal(stored, account.username, 'case is kept for display');
});

test('KM-005 AC12 an unknown username gets a stable fake kdf, indistinguishable in shape', async () => {
  const name = uniqueName('Ghost');
  const first = await prelogin(name);
  assert.equal(first.status, 200);
  assert.deepEqual(Object.keys(first.body), ['kdf']);
  assert.deepEqual(Object.keys(first.body.kdf).sort(), ['iter', 'name', 'salt']);
  assert.equal(first.body.kdf.name, 'PBKDF2-SHA256');
  assert.equal(first.body.kdf.iter, 600000);
  assert.equal(Buffer.from(first.body.kdf.salt, 'base64').length, 16);
  assert.equal(Buffer.from(first.body.kdf.salt, 'base64').toString('base64'), first.body.kdf.salt);
  assert.equal((await prelogin(name)).text, first.text);
  assert.equal((await prelogin(name.toUpperCase())).text, first.text);
  assert.equal((await prelogin(name.toLowerCase())).text, first.text);
  assert.notEqual((await prelogin(uniqueName('Ghost'))).body.kdf.salt, first.body.kdf.salt);
  const real = await prelogin((await createAccount(server)).username);
  assert.deepEqual(comparable(real).headers, comparable(first).headers.map(([k, v]) => [k, k === 'content-length' ? String(real.text.length) : v]));
});

test('KM-005 AC13 without the server secret prelogin is 500 for real and unknown usernames alike', async () => {
  const bare = await startServer({ SERVER_SECRET: undefined });
  try {
    const account = await createAccount(bare);
    for (const username of [account.username, uniqueName('Ghost')]) {
      const response = await bare.call('GET', `/api/prelogin?username=${username}`);
      assert.equal(response.status, 500);
      assert.equal(response.body.error, 'internal');
    }
  } finally {
    await bare.stop();
  }
});

test('KM-005 AC14 a wrong, missing or unconfigured registration token is one 403, before any content check', async () => {
  const taken = await createAccount(server);
  const before = counts();
  const expected = (await server.call('POST', '/api/register', { json: {} })).text;
  assert.equal(JSON.parse(expected).error, 'registration_closed');
  const bodies = [
    registerBody({ registrationToken: 'wrong' }),
    registerBody({ registrationToken: `${REGISTRATION_TOKEN}x` }),
    registerBody({ registrationToken: REGISTRATION_TOKEN.slice(0, -1) }),
    registerBody({ registrationToken: undefined }),
    registerBody({ registrationToken: 12345 }),
    registerBody({ registrationToken: 'wrong', username: taken.username }),
    registerBody({ registrationToken: 'wrong', username: 'bad name', kdf: null, vault: null }),
  ];
  for (const json of bodies) {
    const response = await server.call('POST', '/api/register', { json });
    assert.equal(response.status, 403);
    assert.equal(response.text, expected);
  }
  assert.equal((await server.call('POST', '/api/register', { raw: '{not json' })).text, expected, 'plan decision 5');
  assert.equal((await server.call('POST', '/api/register', { raw: '[1,2]' })).text, expected);
  assert.equal((await server.call('POST', '/api/register')).text, expected);
  assert.deepEqual(counts(), before);

  const unconfigured = await startServer({ REGISTRATION_TOKEN: undefined });
  const short = await startServer({ REGISTRATION_TOKEN: 'x'.repeat(31) });
  const minimal = await startServer({ REGISTRATION_TOKEN: 'y'.repeat(32) });
  try {
    for (const json of [registerBody(), registerBody({ registrationToken: '' }), registerBody({ registrationToken: 'undefined' })]) {
      const response = await unconfigured.call('POST', '/api/register', { json });
      assert.equal(response.text, expected);
    }
    assert.equal((await short.call('POST', '/api/register', { json: registerBody({ registrationToken: 'x'.repeat(31) }) })).text, expected);
    assert.equal((await minimal.call('POST', '/api/register', { json: registerBody({ registrationToken: 'y'.repeat(32) }) })).status, 201);
  } finally {
    await unconfigured.stop();
    await short.stop();
    await minimal.stop();
  }
});

test('KM-005 AC15 the kdf is checked with a valid token, boundaries included', async () => {
  const salt = Buffer.alloc(16, 7).toString('base64');
  const name = 'PBKDF2-SHA256';
  for (const kdf of [
    { name, iter: 599999, salt },
    { name, iter: 6000001, salt },
    { name, iter: 600000.5, salt },
    { name, iter: '600000', salt },
    { name: 'Argon2id', iter: 600000, salt },
    { name, iter: 600000, salt: Buffer.alloc(15, 7).toString('base64') },
    { name, iter: 600000, salt: Buffer.alloc(17, 7).toString('base64') },
    { name, iter: 600000, salt: 'not base64 at all!!!!!==' },
    { name, iter: 600000, salt, extra: 1 },
    { name, iter: 600000 },
    null,
    undefined,
  ]) {
    const response = await register({ kdf });
    assert.equal(response.status, 400, JSON.stringify(kdf));
    assert.equal(response.body.error, 'invalid_kdf');
  }
  assert.equal((await register({ kdf: { name, iter: 600000, salt } })).status, 201);
  assert.equal((await register({ kdf: { name, iter: 6000000, salt } })).status, 201);
});

test('KM-005 AC16 a username taken, in another case, is 409 and creates nothing', async () => {
  const account = await createAccount(server, { username: `Taken-${uniqueName()}` });
  const before = counts();
  for (const username of [account.username, account.username.toLowerCase(), account.username.toUpperCase()]) {
    const response = await register({ username });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'username_taken');
  }
  assert.deepEqual(counts(), before);
});

test('KM-005 AC17 a vault id taken is 409; the same username then registers with another id', async () => {
  const account = await createAccount(server);
  const username = uniqueName();
  const before = counts();
  const response = await register({ username, vault: newVault({ id: account.vaultId }) });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'vault_exists');
  assert.deepEqual(counts(), before, 'no half-made account');
  assert.equal((await register({ username })).status, 201);
});

test('KM-005 AC18 NFR06 storage failing in the middle of registering is 500 with no token; a retry works', async () => {
  for (const table of ['dt_vault', 'dt_session']) {
    const json = registerBody();
    const before = counts();
    server.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'storage down'); END;`);
    const failed = await server.call('POST', '/api/register', { json });
    server.exec('DROP TRIGGER fail_insert');
    assert.equal(failed.status, 500, table);
    assert.deepEqual(Object.keys(failed.body).sort(), ['error', 'message']);
    assert.equal(failed.body.error, 'internal');
    assert.doesNotMatch(failed.text, /storage down|INSERT|dt_/);
    assert.deepEqual(counts(), before, 'the earlier steps rolled back');
    const retried = await server.call('POST', '/api/register', { json });
    assert.equal(retried.status, 201);
    assert.ok(retried.body.token);
  }
});

test('KM-005 AC40 register refuses a malformed blob with invalid_envelope and stores nothing', async () => {
  const before = counts();
  for (const blob of [undefined, null, 'x', { ...newBlob(), extra: 1 }, { ...newBlob(), iv: 'AAAA' }, { ...newBlob(), ct: '' }]) {
    const response = await register({ vault: newVault({ blob }) });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'invalid_envelope');
  }
  assert.deepEqual(counts(), before);
});

test('KM-005 FR11 register: id, keys, meta and the missing fields map to their own codes', async () => {
  const before = counts();
  const expect = async (over, code) => {
    const response = await register(over);
    assert.equal(response.status, 400, JSON.stringify(over).slice(0, 80));
    assert.equal(response.body.error, code);
  };
  await expect({ vault: newVault({ id: 'ABCDEF0123456789' }) }, 'invalid_id');
  await expect({ vault: newVault({ id: 'abc' }) }, 'invalid_id');
  await expect({ vault: newVault({ id: 42 }) }, 'bad_request');
  await expect({ vault: undefined }, 'bad_request');
  await expect({ authKey: undefined }, 'bad_request');
  await expect({ authKey: Buffer.alloc(31).toString('base64') }, 'bad_request');
  await expect({ wrappedAccountKey: undefined }, 'bad_request');
  await expect({ wrappedAccountKey: { iv: 'x', ct: 'y' } }, 'bad_request');
  await expect({ deviceName: 'd'.repeat(101) }, 'bad_request');
  await expect({ deviceName: 7 }, 'bad_request');
  assert.deepEqual(counts(), before);
  assert.equal((await register({ deviceName: 'd'.repeat(100) })).status, 201);
  assert.equal((await register({ deviceName: undefined })).status, 201);
});
