// Login lockouts per username and per IP. Waiting is done by moving timestamps back in the local file.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, newAuthKey, startServer, uniqueIp, uniqueName } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const login = (username, authKey, ip, headers) => server.call('POST', '/api/login', { json: { username, authKey }, ip, headers });
const wrong = (username, ip) => login(username, newAuthKey(), ip);
const fail = async (username, ip, times) => {
  for (let i = 0; i < times; i++) {
    const response = await wrong(username, ip);
    assert.equal(response.status, 401, `failure ${i + 1} of ${times}`);
  }
};
const assertLocked = (response) => {
  assert.equal(response.status, 429);
  assert.equal(response.body.error, 'too_many_attempts');
  const seconds = Number(response.headers.get('retry-after'));
  assert.ok(Number.isInteger(seconds) && seconds >= 1 && seconds <= 900, `Retry-After ${seconds}`);
};
// Every counter row is keyed by HMAC, so "this lock" is simply "every lock so far" once the IP is isolated.
const expireLocks = () => server.sql('UPDATE sys_auth_attempt SET locked_until = ? WHERE locked_until IS NOT NULL RETURNING key', Date.now() - 1);
const counters = () => server.sql('SELECT key, count, window_start, locked_until FROM sys_auth_attempt');
const clearAll = () => server.exec('DELETE FROM sys_auth_attempt');

test('KM-005 AC21 the 5th failure is still 401; then 429 with Retry-After, even with the right authKey', async () => {
  const account = await createAccount(server);
  const ip = uniqueIp();
  await fail(account.username, ip, 4);
  assert.equal((await wrong(account.username, ip)).status, 401);
  assertLocked(await login(account.username, account.authKey, ip));
});

test('KM-005 AC22 an unknown username goes through the same sequence of codes', async () => {
  const name = uniqueName('Ghost');
  const ip = uniqueIp();
  await fail(name, ip, 5);
  assertLocked(await wrong(name, ip));
});

test('KM-005 AC23 a different case does not split the counter', async () => {
  const name = uniqueName('case');
  const ip = uniqueIp();
  await fail(name.toLowerCase(), ip, 3);
  await fail(name.toUpperCase(), ip, 2);
  assertLocked(await wrong(`${name[0].toUpperCase()}${name.slice(1)}`, ip));
});

test('KM-005 AC24 20 failures from one IP lock that IP on any username; another IP is unaffected', async () => {
  clearAll();
  const account = await createAccount(server);
  const ip = uniqueIp();
  for (let i = 0; i < 5; i++) await fail(uniqueName('spray'), ip, 4);
  assertLocked(await login(account.username, account.authKey, ip));
  assert.equal((await login(account.username, account.authKey, uniqueIp())).status, 200);
});

test('KM-005 AC25 (local half) forwarding headers a client sets are not the address', async () => {
  const ip = uniqueIp();
  const spoof = (n) => ({ 'X-Forwarded-For': `203.0.113.${n}`, 'X-Real-IP': `203.0.113.${n}`, 'True-Client-IP': `203.0.113.${n}`, Forwarded: `for=203.0.113.${n}` });
  for (let i = 0; i < 20; i++) {
    const response = await login(uniqueName('spoof'), newAuthKey(), ip, spoof(i));
    assert.equal(response.status, 401);
  }
  const account = await createAccount(server);
  assertLocked(await login(account.username, account.authKey, ip, spoof(99)));
});

test('KM-005 AC26 two IPv6 addresses of one /64 share a counter, in any spelling; garbage shares one too', async () => {
  const account = await createAccount(server);
  const prefix = '2001:db8:aaaa:bbbb';
  for (let i = 0; i < 5; i++) await fail(uniqueName('v6'), `${prefix}::${(i + 1).toString(16)}`, 2);
  for (let i = 0; i < 5; i++) await fail(uniqueName('v6'), `2001:0DB8:AAAA:BBBB:0000:0000:ffff:${(i + 1).toString(16)}`, 2);
  assertLocked(await login(account.username, account.authKey, `${prefix}:1:2:3:4`));
  assert.equal((await login(account.username, account.authKey, '2001:db8:aaaa:bbbc::1')).status, 200, 'the next /64 is free');

  // A mapped IPv4 is that IPv4.
  const v4 = '203.0.113.77';
  for (let i = 0; i < 5; i++) await fail(uniqueName('map'), i % 2 ? v4 : `::ffff:${v4}`, 4);
  assertLocked(await login(account.username, account.authKey, v4));

  // Local wrangler always fills the header in, so a truly absent address goes through this same branch.
  const garbage = ['not-an-ip', '999.1.1.1', '1.2.3', ':::', '1:2:3', 'g::1', '1::2::3', '1:2:3:4:5:6:7:8:9', '::ffff:999.0.0.1', '1.2.3.4.5'];
  for (let i = 0; i < 20; i++) assert.equal((await wrong(uniqueName('junk'), garbage[i % garbage.length])).status, 401);
  assertLocked(await login(account.username, account.authKey, garbage[0]));
  assertLocked(await login(account.username, account.authKey, 'something-else-entirely'));
  assert.equal((await login(account.username, account.authKey, uniqueIp())).status, 200);
});

test('KM-005 AC27 attempts during a lock do not extend it: the original end still opens the door', async () => {
  const account = await createAccount(server);
  const ip = uniqueIp();
  clearAll();
  await fail(account.username, ip, 5);
  const original = counters().find((row) => row.locked_until !== null).locked_until;
  const before = counters();
  for (let i = 0; i < 5; i++) assertLocked(await wrong(account.username, ip));
  assert.deepEqual(counters(), before, 'counted nothing, extended nothing');
  server.sql('UPDATE sys_auth_attempt SET locked_until = ? WHERE locked_until = ? RETURNING key', Date.now() - 1, original);
  assert.equal((await login(account.username, account.authKey, ip)).status, 200);
});

test('KM-005 AC28 once a lock is over the counter is back at zero', async () => {
  const account = await createAccount(server);
  const ip = uniqueIp();
  clearAll();
  await fail(account.username, ip, 5);
  assertLocked(await wrong(account.username, ip));
  expireLocks();
  await fail(account.username, ip, 4);
  assert.equal((await login(account.username, account.authKey, ip)).status, 200);
});

test('KM-005 AC29 failures older than the window start a new one instead of locking', async () => {
  const account = await createAccount(server);
  const ip = uniqueIp();
  clearAll();
  await fail(account.username, ip, 4);
  server.sql('UPDATE sys_auth_attempt SET window_start = ? RETURNING key', Date.now() - 15 * 60 * 1000 - 1);
  assert.equal((await wrong(account.username, ip)).status, 401);
  assert.deepEqual(counters().map((row) => row.count), [1, 1], 'a new window for both counters');
  assert.equal((await login(account.username, account.authKey, ip)).status, 200);
});

test('KM-005 AC30 a correct login clears the username counter, not the IP counter', async () => {
  const account = await createAccount(server);
  const ip = uniqueIp();
  clearAll();
  await fail(account.username, ip, 4);
  assert.equal((await login(account.username, account.authKey, ip)).status, 200);
  assert.deepEqual(counters().map((row) => row.count), [4], 'only the IP row is left');
  await fail(account.username, ip, 4);
  const rows = counters().map((row) => row.count).sort((a, b) => a - b);
  assert.deepEqual(rows, [4, 8]);
});

test('KM-005 AC31 a request refused with 400 is not counted', async () => {
  const account = await createAccount(server);
  const ip = uniqueIp();
  clearAll();
  for (let i = 0; i < 10; i++) {
    const response = await server.call('POST', '/api/login', { json: { username: account.username }, ip });
    assert.equal(response.status, 400);
  }
  assert.deepEqual(counters(), []);
  assert.equal((await login(account.username, account.authKey, ip)).status, 200);
});

test('KM-005 AC32 a lock stops logins only: prelogin and registering still work', async () => {
  const account = await createAccount(server);
  const ip = uniqueIp();
  await fail(account.username, ip, 5);
  assertLocked(await wrong(account.username, ip));
  const kdf = await server.call('GET', `/api/prelogin?username=${account.username}`, { ip });
  assert.equal(kdf.status, 200);
  assert.deepEqual(kdf.body.kdf, account.kdf);
  assert.equal((await server.call('POST', '/api/logout', { token: account.token, ip })).status, 204);
});

test('KM-005 AC53 NFR05 20 parallel failures on one username: exactly 5 are 401, the rest 429', async () => {
  const account = await createAccount(server);
  const ip = uniqueIp();
  clearAll();
  const responses = await Promise.all(Array.from({ length: 20 }, () => wrong(account.username, ip)));
  const statuses = responses.map((response) => response.status);
  assert.equal(statuses.filter((status) => status === 401).length, 5, statuses.join());
  assert.equal(statuses.filter((status) => status === 429).length, 15, statuses.join());
  for (const response of responses.filter((r) => r.status === 429)) assertLocked(response);
  assert.deepEqual(counters().map((row) => row.count), [5, 5]);
});

test('KM-005 AC59 FR35 a login removes stale rows, keeps live ones, and survives a failing cleanup', async () => {
  const account = await createAccount(server);
  const old = Date.now() - 25 * 60 * 60 * 1000;
  clearAll();
  server.exec(`
    INSERT INTO sys_auth_attempt VALUES ('stale-open', 3, ${old}, NULL);
    INSERT INTO sys_auth_attempt VALUES ('stale-locked', 5, ${old}, ${old + 1});
    INSERT INTO sys_auth_attempt VALUES ('live', 2, ${Date.now()}, NULL);
    INSERT INTO sys_auth_attempt VALUES ('recent-lock', 5, ${old}, ${Date.now() + 60000});
    INSERT INTO dt_session VALUES ('s_stale', '${account.userId}', 'hash-stale', 'x', NULL, ${old}, ${old}, ${old});
    INSERT INTO dt_session VALUES ('s_expired_recently', '${account.userId}', 'hash-recent', 'x', NULL, ${old}, ${old}, ${Date.now() - 1000});
  `);
  const stale = () => ({
    sessions: server.sql(`SELECT id FROM dt_session WHERE id IN ('s_stale', 's_expired_recently') ORDER BY id`).map((r) => r.id),
    attempts: server.sql(`SELECT key FROM sys_auth_attempt WHERE key IN ('stale-open', 'stale-locked', 'live', 'recent-lock') ORDER BY key`).map((r) => r.key),
  });
  assert.equal((await login(account.username, account.authKey, uniqueIp())).status, 200);
  for (let i = 0; i < 100 && stale().sessions.includes('s_stale'); i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(stale(), { sessions: ['s_expired_recently'], attempts: ['live', 'recent-lock'] });
  assert.ok(server.sql('SELECT 1 FROM dt_session WHERE user_id = ?', account.userId).length >= 2, 'live sessions stay');

  server.exec(`CREATE TRIGGER no_cleanup BEFORE DELETE ON dt_session BEGIN SELECT RAISE(ABORT, 'cleanup down'); END;`);
  const during = await login(account.username, account.authKey, uniqueIp());
  await new Promise((resolve) => setTimeout(resolve, 100));
  server.exec('DROP TRIGGER no_cleanup');
  assert.equal(during.status, 200);
  assert.ok(during.body.token);
});
