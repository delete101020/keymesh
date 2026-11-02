// Origin, routing, response headers, error shape and body limit. Every request goes to a real wrangler.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN, createAccount, newAuthKey, newBlob, newVault, registerBody, startServer, uniqueIp } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

test('KM-005 harness: a real server on an empty database with the six tables, editable from the test', async () => {
  const tables = server.sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND (name GLOB 'dt_*' OR name GLOB 'sys_*') ORDER BY name`).map((r) => r.name);
  assert.deepEqual(tables, ['dt_audit_log', 'dt_session', 'dt_user', 'dt_vault', 'dt_vault_snapshot', 'sys_auth_attempt']);
  assert.equal(server.sql('SELECT count(*) AS n FROM dt_user')[0].n, 0);
  const response = await server.call('GET', '/api/anything');
  assert.ok(response.status);
});

// The 10 operations of docs/06 that KM-008 and KM-009 deliver.
const NOT_DELIVERED = [
  ['PATCH', '/api/vaults/0123456789abcdef'],
  ['DELETE', '/api/vaults/0123456789abcdef'],
  ['POST', '/api/vaults/0123456789abcdef/rotate'],
  ['GET', '/api/vaults/0123456789abcdef/snapshots'],
  ['GET', '/api/vaults/0123456789abcdef/snapshots/3'],
  ['GET', '/api/sessions'],
  ['DELETE', '/api/sessions/s_0123456789abcdef'],
  ['POST', '/api/account/password'],
  ['POST', '/api/account/rotate'],
  ['GET', '/api/audit?limit=5'],
];
const UNKNOWN = [['GET', '/api'], ['GET', '/api/'], ['GET', '/api/nope'], ['DELETE', '/api/login'], ['GET', '/api/register'], ['GET', '/api/vaults/'], ['OPTIONS', '/api/login']];

const assertSafeHeaders = (response, label) => {
  assert.equal(response.headers.get('cache-control'), 'no-store', label);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', label);
};
const assertNotFound = (response, label) => {
  assert.equal(response.status, 404, label);
  assert.equal(response.body?.error, 'not_found', label);
  assert.match(response.headers.get('content-type'), /^application\/json/, label);
  assertSafeHeaders(response, label);
};

test('KM-005 AC03 an operation not delivered yet is a JSON 404, with and without a token', async () => {
  for (const [method, path] of [...NOT_DELIVERED, ...UNKNOWN]) {
    const without = await server.call(method, path);
    const withToken = await server.call(method, path, { token: 'any-token-at-all' });
    assertNotFound(without, `${method} ${path}`);
    assert.equal(withToken.text, without.text);
  }
});

test('KM-005 AC04 an Origin outside the list, null, or another port is refused first', async () => {
  const before = server.sql('SELECT count(*) AS n FROM dt_user')[0].n;
  for (const origin of ['https://evil.example', 'null', 'https://app.keymesh.test:8443', 'http://app.keymesh.test', 'https://APP.keymesh.test', 'https://app.keymesh.test/']) {
    for (const [method, path] of [...NOT_DELIVERED, ...UNKNOWN, ['GET', '/api/prelogin?username=a'], ['POST', '/api/register'], ['POST', '/api/login'], ['POST', '/api/logout'], ['GET', '/api/vaults'], ['POST', '/api/vaults'], ['GET', '/api/vaults/0123456789abcdef'], ['PUT', '/api/vaults/0123456789abcdef']]) {
      const response = await server.call(method, path, { origin });
      assert.equal(response.status, 403, `${origin} ${method} ${path}`);
      assert.equal(response.body.error, 'forbidden_origin');
      assertSafeHeaders(response, path);
    }
  }
  assert.equal(server.sql('SELECT count(*) AS n FROM dt_user')[0].n, before);
});

test('KM-005 AC09 the body limit counts received bytes: 2 000 001 is refused, 2 000 000 is not', async () => {
  const over = await server.call('POST', '/api/register', { raw: ' '.repeat(2_000_001) });
  assert.equal(over.status, 413);
  assert.equal(over.body.error, 'too_large');
  assertSafeHeaders(over, '413');
  const chunked = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 20; i++) controller.enqueue(new TextEncoder().encode(' '.repeat(100_000)));
      controller.enqueue(new TextEncoder().encode(' '));
      controller.close();
    },
  });
  const overChunked = await server.call('POST', '/api/register', { raw: chunked });
  assert.equal(overChunked.status, 413);
  const exact = await server.call('POST', '/api/register', { raw: ' '.repeat(2_000_000) });
  assert.notEqual(exact.status, 413);
});

test('KM-005 AC09 a body of exactly 2 000 000 bytes padded with spaces is accepted end to end', async () => {
  const text = JSON.stringify(registerBody());
  const response = await server.call('POST', '/api/register', { raw: text + ' '.repeat(2_000_000 - text.length) });
  assert.equal(response.status, 201);
});

test('KM-005 AC05 an allowed Origin, or none, goes on; no CORS header ever', async () => {
  const account = await createAccount(server);
  for (const options of [{}, { origin: ORIGIN }]) {
    const response = await server.call('GET', `/api/prelogin?username=${account.username}`, options);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.kdf, account.kdf);
    assert.deepEqual([...response.headers.keys()].filter((name) => name.startsWith('access-control-')), []);
  }
  const refused = await server.call('GET', '/api/nope', { origin: 'https://evil.example' });
  assert.deepEqual([...refused.headers.keys()].filter((name) => name.startsWith('access-control-')), []);
});

test('KM-005 AC06 with no origin list configured every Origin is refused, and none still goes on', async () => {
  const closed = await startServer({ ALLOWED_ORIGINS: undefined });
  try {
    for (const origin of [ORIGIN, 'null', closed.url]) {
      const response = await closed.call('GET', '/api/prelogin?username=a', { origin });
      assert.equal(response.status, 403);
      assert.equal(response.body.error, 'forbidden_origin');
    }
    assert.equal((await closed.call('GET', '/api/prelogin?username=a')).status, 200);
  } finally {
    await closed.stop();
  }
});

test('KM-005 AC09 FR05 D1 refusing a value as too big is 413, not 500', async () => {
  server.exec(`CREATE TRIGGER too_big BEFORE INSERT ON dt_vault BEGIN SELECT RAISE(ABORT, 'string or blob too big'); END;`);
  const response = await server.call('POST', '/api/register', { json: registerBody() });
  server.exec('DROP TRIGGER too_big');
  assert.equal(response.status, 413);
  assert.equal(response.body.error, 'too_large');
});

// One real request per status code. The 429 and 500 need state, which they build here.
async function everyResponse() {
  const account = await createAccount(server);
  const { token, vaultId } = account;
  const ip = uniqueIp();
  const out = {};
  out[200] = await server.call('GET', '/api/vaults', { token });
  out[201] = await server.call('POST', '/api/vaults', { token, json: newVault() });
  out[304] = await server.call('GET', `/api/vaults/${vaultId}?since=1`, { token });
  out[400] = await server.call('GET', '/api/vaults/not-an-id', { token });
  out[401] = await server.call('GET', '/api/vaults');
  out[403] = await server.call('GET', '/api/vaults', { origin: 'https://evil.example' });
  out[404] = await server.call('GET', '/api/nope');
  out[409] = await server.call('PUT', `/api/vaults/${vaultId}`, { token, json: { baseVersion: 77, blob: newBlob() } });
  out[413] = await server.call('POST', '/api/login', { raw: ' '.repeat(2_000_001) });
  for (let i = 0; i < 5; i++) await server.call('POST', '/api/login', { json: { username: account.username, authKey: newAuthKey() }, ip });
  out[429] = await server.call('POST', '/api/login', { json: { username: account.username, authKey: account.authKey }, ip });
  server.exec(`CREATE TRIGGER fail_all BEFORE INSERT ON dt_vault BEGIN SELECT RAISE(ABORT, 'storage down'); END;`);
  out[500] = await server.call('POST', '/api/vaults', { token, json: newVault() });
  server.exec('DROP TRIGGER fail_all');
  out[204] = await server.call('POST', '/api/logout', { token });
  return out;
}

test('KM-005 AC07 FR03 all twelve kinds of response carry no-store and nosniff', async () => {
  const responses = await everyResponse();
  assert.deepEqual(Object.keys(responses).map(Number).sort((a, b) => a - b), [200, 201, 204, 304, 400, 401, 403, 404, 409, 413, 429, 500]);
  for (const [status, response] of Object.entries(responses)) {
    assert.equal(response.status, Number(status));
    assertSafeHeaders(response, status);
  }
  for (const status of [204, 304]) assert.equal(responses[status].text, '', `${status} has no body`);
});

test('KM-005 AC08 FR04 every error is { error, message }, with a message fixed per code and free of input', async () => {
  const MARK = 'INPUTMARKER';
  const account = await createAccount(server);
  const { token, vaultId } = account;
  const ip = uniqueIp();
  const post = (path, json) => server.call('POST', path, { token, json });
  const blob = newBlob();
  const cases = {
    bad_request: () => server.call('GET', `/api/prelogin?username=${MARK}%20bad`),
    invalid_id: () => server.call('GET', `/api/vaults/${MARK}`, { token }),
    invalid_kdf: () => post('/api/register', registerBody({ kdf: { name: MARK, iter: 1, salt: MARK } })),
    invalid_envelope: () => server.call('PUT', `/api/vaults/${vaultId}`, { token, json: { baseVersion: 1, blob: { format: MARK } } }),
    unauthorized: () => server.call('GET', '/api/vaults', { token: MARK }),
    invalid_credentials: () => post('/api/login', { username: `${MARK}-nobody`, authKey: newAuthKey() }),
    registration_closed: () => post('/api/register', registerBody({ registrationToken: MARK })),
    forbidden_origin: () => server.call('GET', '/api/nope', { origin: `https://${MARK}.example` }),
    not_found: () => server.call('GET', `/api/${MARK}`),
    username_taken: () => post('/api/register', registerBody({ username: account.username, deviceName: MARK })),
    vault_exists: () => post('/api/vaults', newVault({ id: vaultId })),
    too_large: () => server.call('POST', '/api/login', { raw: MARK.repeat(250_000) }),
  };
  const seen = new Map();
  const check = (response, code, keys = ['error', 'message']) => {
    assert.equal(response.body?.error, code);
    assert.deepEqual(Object.keys(response.body).sort(), [...keys].sort(), code);
    assert.equal(typeof response.body.message, 'string');
    assert.ok(response.body.message.length > 0);
    assert.ok(!response.text.includes(MARK), `${code} echoes input`);
    assert.doesNotMatch(response.body.message, /\bat \S+:\d+|SELECT|INSERT|UPDATE|sqlite|D1_/i, code);
    seen.set(code, response.body.message);
  };
  for (const [code, send] of Object.entries(cases)) check(await send(), code);

  for (let i = 0; i < 5; i++) await server.call('POST', '/api/login', { json: { username: `${MARK}-locked`, authKey: newAuthKey() }, ip });
  check(await server.call('POST', '/api/login', { json: { username: `${MARK}-locked`, authKey: newAuthKey() }, ip }), 'too_many_attempts');

  const conflict = await server.call('PUT', `/api/vaults/${vaultId}`, { token, json: { baseVersion: 99, blob } });
  check(conflict, 'version_conflict', ['error', 'message', 'version', 'updatedAt', 'blob']);

  server.exec(`CREATE TRIGGER fail_all BEFORE INSERT ON dt_vault BEGIN SELECT RAISE(ABORT, 'INPUTMARKER storage down'); END;`);
  const broken = await post('/api/vaults', newVault());
  server.exec('DROP TRIGGER fail_all');
  check(broken, 'internal');

  assert.equal(seen.size, 15);
  assert.equal(new Set(seen.values()).size, 15, 'each code has its own fixed message');
});
