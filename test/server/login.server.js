// Login: credentials and sessions. Lockouts are in rate-limit.server.js.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { comparable, createAccount, newAuthKey, startServer, uniqueIp, uniqueName } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const login = (json, ip = uniqueIp()) => server.call('POST', '/api/login', { json, ip });

test('KM-005 AC10 login refuses a username outside the rule; a bad body is 400 bad_request', async () => {
  for (const username of ['', 'có-dấu', 'a b', 'a'.repeat(65), 42, undefined]) {
    const response = await login({ username, authKey: newAuthKey() });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'bad_request');
  }
  for (const authKey of [undefined, '', 'short', 7, Buffer.alloc(31).toString('base64')]) {
    assert.equal((await login({ username: 'someone', authKey })).body.error, 'bad_request');
  }
  assert.equal((await login({ username: 'someone', authKey: newAuthKey(), deviceName: 'd'.repeat(101) })).status, 400);
  assert.equal((await server.call('POST', '/api/login', { raw: '{broken' })).body.error, 'bad_request');
  assert.equal((await server.call('POST', '/api/login', { raw: 'null' })).body.error, 'bad_request');
  assert.equal((await server.call('POST', '/api/login')).body.error, 'bad_request');
});

test('KM-005 AC19 an unknown username and a wrong authKey give byte-identical 401s', async () => {
  const account = await createAccount(server);
  const wrong = await login({ username: account.username, authKey: newAuthKey() });
  const unknown = await login({ username: uniqueName('Ghost'), authKey: newAuthKey() });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'invalid_credentials');
  assert.deepEqual(comparable(unknown), comparable(wrong));
});

test('KM-005 AC20 two devices log in with one authKey: different tokens and sessions, both work', async () => {
  const account = await createAccount(server);
  const a = await login({ username: account.username, authKey: account.authKey, deviceName: 'Pixel 8 · Chrome' });
  const b = await login({ username: account.username.toUpperCase(), authKey: account.authKey });
  for (const device of [a, b]) {
    assert.equal(device.status, 200);
    assert.deepEqual(Object.keys(device.body).sort(), ['expiresAt', 'kdf', 'sessionId', 'token', 'userId', 'wrappedAccountKey']);
    assert.equal(device.body.userId, account.userId);
    assert.deepEqual(device.body.kdf, account.kdf);
    assert.deepEqual(device.body.wrappedAccountKey, account.wrappedAccountKey);
    assert.equal(Buffer.from(device.body.token, 'base64url').length, 32);
  }
  assert.notEqual(a.body.token, b.body.token);
  assert.notEqual(a.body.sessionId, b.body.sessionId);
  assert.equal(server.sql('SELECT device_name FROM dt_session WHERE id = ?', a.body.sessionId)[0].device_name, 'Pixel 8 · Chrome');
  assert.equal((await server.call('POST', '/api/logout', { token: a.body.token })).status, 204);
  assert.equal((await server.call('POST', '/api/logout', { token: b.body.token })).status, 204);
  assert.equal((await server.call('POST', '/api/logout', { token: account.token })).status, 204);
});

test('KM-005 plan decision 3 without the server secret login is 500, before any credential is judged', async () => {
  const bare = await startServer({ SERVER_SECRET: undefined });
  try {
    const account = await createAccount(bare);
    const response = await bare.call('POST', '/api/login', { json: { username: account.username, authKey: account.authKey } });
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'internal');
    assert.ok(!response.text.includes('token'));
  } finally {
    await bare.stop();
  }
});
