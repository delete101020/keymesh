// Sessions: what a token is worth, how long, and how it ends. Expiry and stamps are edited in the local file.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { comparable, createAccount, newAuthKey, startServer, uniqueIp } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const hashOf = (token) => createHash('sha256').update(token).digest('base64');
const logout = (token) => server.call('POST', '/api/logout', { token });
const login = (account) => server.call('POST', '/api/login', { json: { username: account.username, authKey: account.authKey }, ip: uniqueIp() });
const DAY = 24 * 60 * 60 * 1000;
const expiryOf = (token) => server.sql('SELECT expires_at FROM dt_session WHERE token_hash = ?', hashOf(token))[0]?.expires_at;
const anUnauthorized = () => server.call('POST', '/api/logout');

// Every authenticated operation, with an id or body that would be wrong had the token passed.
const GUARDED = [
  ['POST', '/api/logout', { raw: '{broken' }],
  ['GET', '/api/vaults', {}],
  ['POST', '/api/vaults', { raw: '{broken' }],
  ['GET', '/api/vaults/NOT-AN-ID', {}],
  ['GET', '/api/vaults/0123456789abcdef?since=abc', {}],
  ['PUT', '/api/vaults/NOT-AN-ID', { raw: '{broken' }],
  ['PUT', '/api/vaults/0123456789abcdef', { raw: '{broken' }],
];

const assertRefused = async (headersOrToken, label) => {
  const expected = await anUnauthorized();
  assert.equal(expected.status, 401);
  assert.equal(expected.body.error, 'unauthorized');
  for (const [method, path, options] of GUARDED) {
    const response = await server.call(method, path, { ...options, ...headersOrToken });
    assert.deepEqual(comparable(response), comparable(expected), `${label}: ${method} ${path}`);
  }
};

test('KM-005 AC33 every way a token can be bad gives one and the same 401, before content is looked at', async () => {
  await assertRefused({}, 'missing');
  for (const authorization of ['', 'Bearer', 'Bearer ', 'Basic abc', 'bearer x', `Bearer ${randomBytes(32).toString('base64url')}x`, 'Bearer not a token', `Bearer ${randomBytes(32).toString('base64')}`]) {
    await assertRefused({ headers: { Authorization: authorization } }, `malformed ${authorization.slice(0, 12)}`);
  }
  await assertRefused({ token: randomBytes(32).toString('base64url') }, 'unknown');

  const loggedOut = await createAccount(server);
  assert.equal((await logout(loggedOut.token)).status, 204);
  await assertRefused({ token: loggedOut.token }, 'logged out');

  const expired = await createAccount(server);
  server.sql('UPDATE dt_session SET expires_at = ? WHERE token_hash = ? RETURNING id', Date.now() - 1000, hashOf(expired.token));
  await assertRefused({ token: expired.token }, 'expired');

  const stamped = await createAccount(server);
  server.sql(`UPDATE dt_user SET security_stamp = 'changed' WHERE id = ? RETURNING id`, stamped.userId);
  await assertRefused({ token: stamped.token }, 'stamp changed');
});

test('KM-005 AC34 using a token renews it for 30 days from then; at the expiry instant it is refused', async () => {
  const account = await createAccount(server);
  server.sql('UPDATE dt_session SET expires_at = ? WHERE token_hash = ? RETURNING id', Date.now() + DAY, hashOf(account.token));
  const before = Date.now();
  assert.equal((await server.call('GET', '/api/vaults', { token: account.token })).status, 200);
  const after = Date.now();
  const renewed = expiryOf(account.token);
  assert.ok(renewed >= before + 30 * DAY && renewed <= after + 30 * DAY, 'renewed from now, not from the old expiry');

  // Past the instant by one millisecond at the earliest: expiry is not a grace period.
  const edge = await createAccount(server);
  const instant = Date.now();
  server.sql('UPDATE dt_session SET expires_at = ? WHERE token_hash = ? RETURNING id', instant, hashOf(edge.token));
  assert.equal((await server.call('GET', '/api/vaults', { token: edge.token })).status, 401);
  assert.equal(expiryOf(edge.token), instant, 'a refused token is not renewed');
});

test('KM-005 AC35 logging out ends only that session; the same token then gets 401, even to log out', async () => {
  const account = await createAccount(server);
  const other = await login(account);
  const response = await logout(account.token);
  assert.equal(response.status, 204);
  assert.equal(response.text, '');
  assert.equal((await logout(account.token)).status, 401);
  assert.equal(server.sql('SELECT count(*) AS n FROM dt_session WHERE user_id = ?', account.userId)[0].n, 1);
  assert.equal((await login({ ...account, authKey: newAuthKey() })).status, 401);
  assert.equal((await logout(other.body.token)).status, 204);
});
