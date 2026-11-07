import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, kdfAcceptable, usernameError } from '../src/public/js/auth.js';
import { createSession } from '../src/public/js/session.js';
import { createItem, updateItem } from '../src/public/js/core/model.js';
import { memoryStore } from '../testkit/memory-store.mjs';
import { fakeApi } from '../testkit/fake-api.mjs';

const PW = 'correct horse battery staple';
const PW_B = 'another horse battery staple';
const DOWN = async () => ({ ok: false, kind: 'network' });

// A device: its own store and session, talking to `server`.
function device(server) {
  const store = memoryStore();
  const session = createSession({ store });
  const auth = createAuth({ store, session, api: server.api, deviceName: 'Test' });
  return { store, session, auth };
}

// Device A with a local account holding one item, registered as `username`.
async function registered(server, username = 'kf', password = PW) {
  const a = device(server);
  await a.session.createAccount(password);
  await a.session.mutate((v, ctx) => createItem(v, 'login', { title: 'Partner X' }, ctx));
  const r = await a.auth.register({ username, registrationToken: server.registrationToken, password });
  assert.deepEqual(r, { ok: true });
  return a;
}

const snapshot = (store) => JSON.stringify([store.account, store.session, store.rows]);

test('KM-006 AC04 FR03 usernames are checked as docs/06 says, before any request', () => {
  assert.deepEqual(['', 'x'.repeat(65), 'bad name', 'tên', 'a/b'].map(usernameError), ['empty', 'too-long', 'chars', 'chars', 'chars']);
  assert.equal(usernameError('kf.user_1-x@mail+tag'), null);
  assert.equal(usernameError('x'.repeat(64)), null);
});

test('KM-006 AC04 FR03 a wrong password or a bad username at register: an error and no request', async () => {
  const server = fakeApi();
  const a = device(server);
  await a.session.createAccount(PW);
  assert.deepEqual(await a.auth.register({ username: 'kf', registrationToken: server.registrationToken, password: 'wrong' }), { ok: false, error: 'wrong-password' });
  assert.deepEqual(await a.auth.register({ username: 'bad name', registrationToken: server.registrationToken, password: PW }), { ok: false, error: 'username' });
  assert.deepEqual(server.calls, []);
});

test('KM-006 AC03 FR04 registering sends the keys and vault this device has, byte for byte; no token kept', async () => {
  const server = fakeApi();
  const a = device(server);
  await a.session.createAccount(PW);
  await a.session.mutate((v, ctx) => createItem(v, 'login', { title: 'Partner X' }, ctx));
  const before = structuredClone({ account: a.store.account, row: a.store.row });
  assert.deepEqual(await a.auth.register({ username: 'Kf', registrationToken: server.registrationToken, password: PW }), { ok: true });
  const [stored] = server.vaults.values();
  const user = server.users.get('kf');
  assert.deepEqual(stored.wrappedVaultKey, before.row.wrappedVaultKey);
  assert.deepEqual(stored.meta, before.row.meta);
  assert.deepEqual(stored.blob, before.row.current.envelope);
  assert.deepEqual(user.wrappedAccountKey, before.account.wrappedAccountKey);
  assert.deepEqual(user.kdf, before.account.kdf);
  assert.deepEqual([a.store.account.username, a.store.account.userId, a.store.row.current.version, a.store.row.current.dirty], ['Kf', user.userId, 1, false]);
  assert.ok(!snapshot(a.store).includes(server.registrationToken));
  a.session.lock();
  await a.session.unlock(PW);
  assert.equal(a.session.vault.items[0].title, 'Partner X');
});

test('KM-006 AC05 FR05 each register failure has its own code and changes nothing on the device', async () => {
  const server = fakeApi();
  await registered(server, 'taken');
  const a = device(server);
  await a.session.createAccount(PW);
  const before = snapshot(a.store);
  const tries = [
    [() => server.override('register', DOWN), 'network'],
    [() => server.override('register', async () => ({ ok: false, kind: 'http', status: 500, code: 'internal' })), 'server'],
  ];
  for (const [arrange, code] of tries) {
    arrange();
    assert.equal((await a.auth.register({ username: 'kf2', registrationToken: server.registrationToken, password: PW })).error, code);
    server.reset('register');
  }
  assert.equal((await a.auth.register({ username: 'kf2', registrationToken: 'wrong', password: PW })).error, 'registration-closed');
  assert.equal((await a.auth.register({ username: 'TAKEN', registrationToken: server.registrationToken, password: PW })).error, 'username-taken');
  const [taken] = server.vaults.keys();
  server.put({ ...server.vaults.get(taken), id: a.store.row.id });
  assert.equal((await a.auth.register({ username: 'kf3', registrationToken: server.registrationToken, password: PW })).error, 'vault-exists');
  assert.equal(snapshot(a.store), before);
  assert.ok(!before.includes(server.registrationToken));
});

test('KM-006 AC07 FR07 an empty device logs in: everything on disk at once, new device id, opens offline after', async () => {
  const server = fakeApi();
  const a = await registered(server);
  const b = device(server);
  assert.deepEqual(await b.auth.login({ username: 'KF', password: PW }), { ok: true, kind: 'new-device' });
  assert.deepEqual(b.session.vault, a.session.vault);
  assert.notEqual(b.store.account.deviceId, a.store.account.deviceId);
  assert.deepEqual([b.store.row.current.dirty, b.store.row.current.version, b.store.row.base.version], [false, 1, 1]);
  assert.ok(b.store.session.token);
  b.session.lock();
  const n = server.calls.length;
  await b.session.unlock(PW);
  assert.equal(b.session.vault.items[0].title, 'Partner X');
  assert.equal(server.calls.length, n, 'unlock needs no server');
});

test('KM-006 AC08 FR07 a download or a disk write failing midway leaves the device empty; logging in again works', async () => {
  const server = fakeApi();
  await registered(server);
  const b = device(server);
  server.override('getVault', DOWN);
  assert.equal((await b.auth.login({ username: 'kf', password: PW })).error, 'network');
  server.reset('getVault');
  assert.equal(b.store.account, null);
  b.store.failOn.add('createAccount');
  await assert.rejects(b.auth.login({ username: 'kf', password: PW }), /write failed/);
  b.store.failOn.clear();
  assert.deepEqual([b.store.account, b.store.session, b.store.rows], [null, null, []]);
  assert.equal(b.session.unlocked, false);
  assert.equal((await b.auth.login({ username: 'kf', password: PW })).ok, true);
});

test('KM-006 AC09 FR06 wrong name and wrong password read the same; 429 gives minutes rounded up', async () => {
  const server = fakeApi();
  await registered(server);
  const b = device(server);
  const wrongName = await b.auth.login({ username: 'nobody', password: PW });
  const wrongPw = await b.auth.login({ username: 'kf', password: 'nope' });
  assert.deepEqual(wrongName, wrongPw);
  assert.deepEqual(wrongName, { ok: false, error: 'invalid-credentials' });
  server.override('login', async () => ({ ok: false, kind: 'http', status: 429, code: 'too_many_attempts', retryAfter: 61 }));
  assert.deepEqual(await b.auth.login({ username: 'kf', password: PW }), { ok: false, error: 'rate-limited', minutes: 2 });
  assert.equal(b.store.account, null);
});

test('KM-006 AC10 FR06 iter outside 600 000–6 000 000 is refused before deriving: no login request', async () => {
  const server = fakeApi();
  await registered(server);
  const b = device(server);
  for (const iter of [599999, 6000001]) {
    server.override('prelogin', async () => ({ ok: true, status: 200, body: { kdf: { name: 'PBKDF2-SHA256', iter, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' } } }));
    const n = server.calls.filter((c) => c === 'login').length;
    assert.deepEqual(await b.auth.login({ username: 'kf', password: PW }), { ok: false, error: 'incompatible' });
    assert.equal(server.calls.filter((c) => c === 'login').length, n);
  }
  assert.equal(kdfAcceptable({ name: 'PBKDF2-SHA256', iter: 600000, salt: 'x' }), true);
  assert.equal(kdfAcceptable({ name: 'scrypt', iter: 600000 }), false);
});

test('KM-006 AC11 AC12 FR09 another account on this device: ask; cancel ends the new session, replace swaps', async () => {
  const server = fakeApi();
  await registered(server, 'bee', PW_B);
  const a = device(server);
  await a.session.createAccount(PW); // never registered: risky
  const before = snapshot(a.store);
  const first = await a.auth.login({ username: 'bee', password: PW_B });
  assert.deepEqual(first.choose, { username: null, risky: true });
  const tokens = server.sessions.size;
  await first.cancel();
  assert.equal(server.sessions.size, tokens - 1, 'the session just made is gone');
  assert.equal(snapshot(a.store), before);
  a.session.lock();
  await a.session.unlock(PW);
  const second = await a.auth.login({ username: 'bee', password: PW_B });
  assert.deepEqual(await second.replace(), { ok: true, kind: 'new-device' });
  assert.equal(a.store.account.username, 'bee');
  assert.equal(a.session.vault.items[0].title, 'Partner X');
  assert.ok(!snapshot(a.store).includes(JSON.parse(before)[0].wrappedAccountKey.ct));
});

test('KM-006 AC12 FR09 a registered account with nothing pending is not risky', async () => {
  const server = fakeApi();
  await registered(server, 'bee', PW_B);
  const a = await registered(server, 'ant', PW);
  assert.deepEqual((await a.auth.login({ username: 'bee', password: PW_B })).choose, { username: 'ant', risky: false });
  await a.session.mutate((v, ctx) => createItem(v, 'note', { title: 'pending' }, ctx));
  assert.deepEqual((await a.auth.login({ username: 'bee', password: PW_B })).choose, { username: 'ant', risky: true });
});

test('KM-006 AC13 FR09 from the lock screen: a wrong login for B asks nothing; a right one asks without A\'s password', async () => {
  const server = fakeApi();
  await registered(server, 'bee', PW_B);
  const a = await registered(server, 'ant', PW);
  a.session.lock();
  const before = snapshot(a.store);
  assert.deepEqual(await a.auth.login({ username: 'bee', password: 'wrong' }), { ok: false, error: 'invalid-credentials' });
  assert.equal(snapshot(a.store), before);
  const r = await a.auth.login({ username: 'bee', password: PW_B });
  assert.ok(r.choose);
  assert.equal(a.session.unlocked, false);
});

test('KM-006 AC06 FR08 registered but the answer was lost: logging in is the same account; later changes pending, no mark', async () => {
  const server = fakeApi();
  const a = device(server);
  await a.session.createAccount(PW);
  const item = await a.session.mutate((v, ctx) => createItem(v, 'login', { title: 'Partner X' }, ctx));
  server.override('register', async (real, body) => {
    real(body);
    return { ok: false, kind: 'network' };
  });
  assert.equal((await a.auth.register({ username: 'kf', registrationToken: server.registrationToken, password: PW })).error, 'network');
  server.reset('register');
  assert.equal(a.store.account.userId, null);
  await a.session.mutate((v, ctx) => updateItem(v, item.id, { notes: 'after' }, ctx));
  assert.deepEqual(await a.auth.login({ username: 'kf', password: PW }), { ok: true, kind: 'same' });
  assert.ok(a.store.account.userId);
  assert.deepEqual([a.store.row.base.version, a.store.row.current.version, a.store.row.current.dirty], [1, 1, true]);
  assert.equal(a.session.pendingCount(), 1);
  assert.equal(a.session.vault.items[0].conflict, null);
});

test('KM-006 FR08 FR25 logging in again on the same registered account only renews the session', async () => {
  const server = fakeApi();
  const a = await registered(server);
  const rows = JSON.stringify(a.store.rows);
  const oldToken = a.store.session.token;
  assert.deepEqual(await a.auth.login({ username: 'kf', password: PW }), { ok: true, kind: 'same' });
  assert.notEqual(a.store.session.token, oldToken);
  assert.equal(JSON.stringify(a.store.rows), rows);
});

test('KM-006 AC14 AC15 FR11 ending a session: revoked online; offline it still goes from the device', async () => {
  const server = fakeApi();
  const a = await registered(server);
  const token = a.store.session.token;
  assert.deepEqual(await a.auth.endSession(), { revoked: true });
  assert.equal(server.sessions.has(token), false);
  assert.equal(a.store.session, null);
  await a.auth.login({ username: 'kf', password: PW });
  server.override('logout', DOWN);
  const kept = a.store.session.token;
  assert.deepEqual(await a.auth.endSession(), { revoked: false });
  assert.equal(a.store.session, null);
  assert.equal(server.sessions.has(kept), true, 'the server still has it until it expires');
});

test('KM-006 AC19 FR14 a passkey record is never sent and survives same-account login and logout', async () => {
  const server = fakeApi();
  const a = await registered(server);
  const record = { credentialId: 'cred-km006-passkey-marker', prfSalt: 'salt-marker', wrappedAccountKey: { iv: 'iv', ct: 'passkey-wrapped-marker' } };
  a.store.setPasskey(record);
  const sent = [];
  for (const name of Object.keys(server.api)) {
    const real = server.api[name];
    server.api[name] = async (...args) => {
      sent.push(JSON.stringify(args));
      return real(...args);
    };
  }
  await a.auth.login({ username: 'kf', password: PW });
  await a.auth.endSession();
  assert.equal(await a.store.hasPasskey(), true);
  assert.ok(!sent.join().includes('marker'));
});

// --- remote.js over a fake fetch -----------------------------------------------------------------------

import { createApi } from '../src/public/js/remote.js';

const reply = (status, body, headers = {}) => async () => new Response(body === null ? null : JSON.stringify(body), { status, headers });

test('KM-006 FR24 FR25 remote.js: results by status, Bearer token, If-None-Match, Retry-After, 409 copy', async () => {
  let seen;
  const api = createApi({ fetch: async (url, init) => ((seen = { url, init }), new Response('{"items":[]}', { status: 200, headers: { ETag: '"e1"' } })) });
  assert.deepEqual(await api.listVaults('tok', '"e0"'), { ok: true, status: 200, body: { items: [] }, etag: '"e1"' });
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(seen.init.headers['If-None-Match'], '"e0"');
  assert.equal(seen.init.credentials, 'omit');
  assert.equal((await createApi({ fetch: reply(304, null) }).listVaults('t', '"e"')).notModified, true);
  assert.deepEqual(await createApi({ fetch: reply(429, { error: 'too_many_attempts' }, { 'Retry-After': '90' }) }).login({}), { ok: false, kind: 'http', status: 429, code: 'too_many_attempts', retryAfter: 90 });
  const c = await createApi({ fetch: reply(409, { error: 'version_conflict', version: 4, blob: { iv: 'x' } }) }).putVault('t', 'abc', 3, {});
  assert.deepEqual(c.conflict, { version: 4, blob: { iv: 'x' } });
  assert.equal((await createApi({ fetch: reply(500, null) }).getVault('t', 'a')).status, 500);
  assert.deepEqual(await createApi({ fetch: async () => { throw new TypeError('Failed to fetch'); } }).prelogin('x'), { ok: false, kind: 'network' });
});

test('KM-006 FR24 remote.js: a request hanging past the timeout counts as lost connection', async () => {
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  assert.deepEqual(await createApi({ fetch: hang, timeoutMs: 20 }).listVaults('t'), { ok: false, kind: 'network' });
});
