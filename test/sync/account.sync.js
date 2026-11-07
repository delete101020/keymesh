// KM-006 AC01–AC13: register, log in, replace, on real browsers against a real local server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD,
  READ_DB_ALL,
  READ_STORES,
  REGISTRATION_TOKEN,
  createItem,
  login,
  newUsername,
  register,
  serverVaults,
  setup,
  startDevices,
  unlock,
  waitClean,
} from '../../testkit/sync-devices.mjs';

const PW_B = 'bee horse battery staple';
let env;
test.before(async () => {
  env = await startDevices({ names: ['A', 'B'] });
});
test.after(() => env?.stop());

const db = (page) => page.eval(READ_DB_ALL);
const apiCount = (page) => page.apiCalls().length;
const errText = (page) => page.eval(`[...document.querySelectorAll('.err')].map((e) => e.textContent).join('')`);
const fresh = async (name) => (await env.add(name)).page;

// A device with a local account and one item, registered as `username`.
async function registeredDevice(name, username, password = PASSWORD) {
  const page = await fresh(name);
  await setup(page, password);
  await createItem(page, { title: `Item of ${username}`, values: { Password: `pw-${username}` } });
  assert.equal(await register(page, { username, token: REGISTRATION_TOKEN, password }), '');
  await waitClean(page);
  return page;
}

test('KM-006 AC01 FR01 FR15 an empty device offline: create, add an item, lock, unlock; no API request at all', async () => {
  const page = await fresh('offline');
  await page.waitFor(page.find('Tạo tài khoản'), { what: 'empty-device screen' });
  assert.ok(await page.has('Đăng nhập'), 'the empty device offers both ways in');
  await page.setOffline(true);
  await setup(page);
  await createItem(page, { title: 'Offline item' });
  await page.click('Khoá');
  await unlock(page);
  await page.waitText('Offline item');
  assert.equal(apiCount(page), 0);
  await page.setOffline(false);
  await page.click('Khoá');
  await unlock(page);
  await new Promise((r) => setTimeout(r, 2000));
  assert.equal(apiCount(page), 0, 'never registered: no request online either');
});

test('KM-006 AC02 FR02 strength: abc, 12, 14 characters, 14 of 2 distinct; nothing blocks; weak warns at register', async () => {
  const page = await fresh('strength');
  const levels = [];
  for (const pw of ['abc', 'abcdefghijkl', 'abcdefghijklmn', 'ab'.repeat(7)]) {
    await page.fill('Master password', pw);
    levels.push(await page.eval(`document.querySelector('.strength-label').textContent`));
  }
  assert.deepEqual(levels, ['Độ mạnh: Yếu', 'Độ mạnh: Khá', 'Độ mạnh: Mạnh', 'Độ mạnh: Yếu']);
  await setup(page, 'abc'); // weak still creates
  await page.click('Cài đặt');
  await page.click('Đăng ký để đồng bộ');
  await page.fill('Master password hiện tại', 'abc');
  await page.waitText('bảo vệ cả dữ liệu trên server');
  assert.equal(await page.eval(`document.querySelector('dialog[open] button[type=submit]').disabled`), false);
  await page.fill('Master password hiện tại', 'abcdefghijklmn');
  await page.waitNoText('bảo vệ cả dữ liệu trên server');
  await page.key('Escape');
});

test('KM-006 AC03 FR04 register: server copy byte for byte, version 1, unlock with the old password, read back elsewhere', async () => {
  const { A, B, server } = env;
  await setup(A.page);
  await createItem(A.page, { title: 'Partner X', values: { Password: 'secret-ac03' } });
  const before = await db(A.page);
  const username = newUsername('ac03');
  assert.equal(await register(A.page, { username, token: REGISTRATION_TOKEN, password: PASSWORD }), '');
  await waitClean(A.page);
  const after = await db(A.page);
  const [row] = after.rows;
  const [onServer] = serverVaults(server).filter((v) => v.id === row.id);
  assert.equal(onServer.version, 1);
  assert.deepEqual(JSON.parse(onServer.wrapped_vault_key), before.rows[0].wrappedVaultKey);
  assert.deepEqual(JSON.parse(onServer.meta), before.rows[0].meta);
  assert.deepEqual(JSON.parse(onServer.blob), before.rows[0].current.envelope);
  const [user] = server.sql('SELECT id, wrapped_account_key, kdf_iter, kdf_salt FROM dt_user WHERE username = ?', username);
  assert.deepEqual(JSON.parse(user.wrapped_account_key), before.account.wrappedAccountKey);
  assert.equal(user.kdf_salt, before.account.kdf.salt);
  assert.deepEqual([after.account.userId, after.account.username, row.current.version, row.base.version, row.current.dirty], [user.id, username, 1, 1, false]);
  assert.ok(!(await A.page.eval(READ_STORES)).includes(REGISTRATION_TOKEN), 'no registration token kept');
  await A.page.click('Khoá');
  await unlock(A.page);
  await A.page.waitText('Partner X');
  assert.equal(await login(B.page, { username, password: PASSWORD }), 'main');
  await B.page.waitText('Partner X');
  env.ac03 = { username };
});

test('KM-006 AC04 FR03 a bad username or a wrong password at register: an error, no request', async () => {
  const page = await fresh('ac04');
  await setup(page);
  const n = apiCount(page);
  const messages = [];
  for (const [username, password] of [['', PASSWORD], ['x'.repeat(65), PASSWORD], ['bad name', PASSWORD], ['good-name', 'wrong password']]) {
    messages.push(await register(page, { username, token: REGISTRATION_TOKEN, password }));
    await page.key('Escape');
  }
  assert.ok(messages.every(Boolean), JSON.stringify(messages));
  assert.match(messages[3], /Sai master password/);
  assert.equal(apiCount(page), n);
});

test('KM-006 AC05 FR05 offline, wrong token, taken name, taken vault id, 500: each its own message, nothing changes here', async () => {
  const { server } = env;
  const page = await fresh('ac05');
  await setup(page);
  await createItem(page, { title: 'ac05 item' });
  const before = await db(page);
  const vaultId = before.rows[0].id;
  const out = {};
  await page.setOffline(true);
  out.offline = await register(page, { username: newUsername('ac05'), token: REGISTRATION_TOKEN, password: PASSWORD });
  await page.key('Escape');
  await page.setOffline(false);
  out.token = await register(page, { username: newUsername('ac05'), token: 'wrong-token', password: PASSWORD });
  await page.key('Escape');
  out.taken = await register(page, { username: env.ac03.username.toUpperCase(), token: REGISTRATION_TOKEN, password: PASSWORD });
  assert.ok(await page.has('Đăng nhập bằng tên này'), 'a taken name offers to log in with it');
  await page.key('Escape');
  const [owner] = server.sql('SELECT id FROM dt_user LIMIT 1');
  server.exec(`INSERT INTO dt_vault (id, user_id, wrapped_vault_key, meta, meta_version, version, blob, size, created_at, updated_at) VALUES ('${vaultId}', '${owner.id}', '{}', '{}', 1, 1, '{}', 2, 0, 0)`);
  out.vault = await register(page, { username: newUsername('ac05'), token: REGISTRATION_TOKEN, password: PASSWORD });
  await page.key('Escape');
  server.exec(`DELETE FROM dt_vault WHERE id = '${vaultId}'`);
  server.exec(`CREATE TRIGGER km006_fail BEFORE INSERT ON dt_user BEGIN SELECT RAISE(ABORT, 'km006'); END`);
  out.server = await register(page, { username: newUsername('ac05'), token: REGISTRATION_TOKEN, password: PASSWORD });
  await page.key('Escape');
  server.exec('DROP TRIGGER km006_fail');
  assert.equal(new Set(Object.values(out)).size, 5, JSON.stringify(out));
  assert.match(out.offline, /Không kết nối được/);
  assert.match(out.token, /đóng đăng ký|token đăng ký/);
  assert.match(out.taken, /đã có trên server/);
  assert.match(out.server, /Server đang gặp lỗi/);
  const after = await db(page);
  assert.deepEqual([after.account, after.rows, after.session], [before.account, before.rows, null]);
  assert.ok(!(await page.eval(READ_STORES)).includes(REGISTRATION_TOKEN));
});

test('KM-006 AC06 FR08 FR26 registered but the answer was cut: logging in is the same account, the later change goes up, no mark', async () => {
  const page = await fresh('ac06');
  await setup(page);
  await createItem(page, { title: 'ac06 first' });
  const off = await page.intercept('*/api/register', () => 'fail', { stage: 'Response' });
  const username = newUsername('ac06');
  assert.match(await register(page, { username, token: REGISTRATION_TOKEN, password: PASSWORD }), /Không kết nối được/);
  await page.key('Escape');
  await off();
  assert.equal((await db(page)).account.userId, null, 'the device still thinks it is local');
  await createItem(page, { title: 'ac06 second' });
  await page.click('Khoá');
  assert.equal(await login(page, { username, password: PASSWORD }), 'main', 'no replace question');
  await waitClean(page);
  const other = await fresh('ac06-other');
  assert.equal(await login(other, { username, password: PASSWORD }), 'main');
  await other.waitText('ac06 second');
  await other.waitText('ac06 first');
  assert.equal(await other.eval(`document.querySelectorAll('.badge-conflict').length`), 0);
});

test('KM-006 AC07 FR07 the logged-in device opens offline with the same data and its own device id', async () => {
  const { A, B } = env;
  const idA = (await db(A.page)).account.deviceId;
  const idB = (await db(B.page)).account.deviceId;
  assert.notEqual(idA, idB);
  await B.page.setOffline(true);
  await B.page.click('Khoá');
  await unlock(B.page);
  await B.page.waitText('Partner X');
  await B.page.setOffline(false);
});

test('KM-006 AC08 FR07 the download failing midway: still an empty device after reload; logging in again works', async () => {
  const page = await fresh('ac08');
  const off = await page.intercept('*/api/vaults/*', () => 'fail');
  assert.match(await login(page, { username: env.ac03.username, password: PASSWORD }), /Không kết nối được/);
  await off();
  await page.reload();
  await page.waitFor(page.find('Tạo tài khoản'), { what: 'empty-device screen' });
  assert.equal((await db(page)).account, null);
  assert.equal(await login(page, { username: env.ac03.username, password: PASSWORD }), 'main');
});

test('KM-006 AC09 FR06 wrong name and wrong password: the same sentence; 429 gives the minutes of Retry-After', async () => {
  const page = await fresh('ac09');
  const victim = await registeredDevice('ac09-owner', newUsername('ac09'));
  const username = (await db(victim)).account.username;
  const wrongName = await login(page, { username: newUsername('nobody'), password: PASSWORD });
  await page.click('Quay lại');
  const wrongPw = await login(page, { username, password: 'not it' });
  assert.equal(wrongName, wrongPw);
  assert.equal(wrongName, 'Sai username hoặc master password.');
  let text = '';
  for (let i = 0; i < 6 && !/phút/.test(text); i++) {
    await page.fill('Master password', `wrong ${i}`);
    await page.click('Đăng nhập', { selector: 'button[type=submit]' });
    await page.waitFor(`document.querySelector('.err').textContent && !document.querySelector('button[type=submit]').disabled`, { timeout: 30000 });
    text = await errText(page);
  }
  const r = await env.server.call('POST', '/api/login', { json: { username, authKey: 'A'.repeat(43) + '=' } });
  assert.equal(r.status, 429);
  const minutes = Math.ceil(Number(r.headers.get('Retry-After')) / 60);
  assert.match(text, new RegExp(`sau (${minutes}|${minutes + 1}) phút`), text);
  assert.equal((await db(page)).account, null);
});

test('KM-006 AC10 FR06 iter 599 999 or 6 000 001 from the server: refused, no login request', async () => {
  const page = await fresh('ac10');
  for (const iter of [599999, 6000001]) {
    const off = await page.intercept('*/api/prelogin*', () => ({ status: 200, body: { kdf: { name: 'PBKDF2-SHA256', iter, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' } } }));
    const text = await login(page, { username: env.ac03.username, password: PASSWORD });
    await off();
    assert.match(text, /không tương thích/);
    await page.click('Quay lại');
  }
  assert.equal(page.apiCalls().filter((p) => p.startsWith('/api/login')).length, 0);
});

test('KM-006 AC11 AC13 FR09 another account from the lock screen: a wrong try asks nothing; cancel keeps A whole and ends the new session', async () => {
  const { server } = env;
  const bee = newUsername('bee');
  await registeredDevice('bee-owner', bee, PW_B);
  const page = await fresh('ac11');
  await setup(page); // A: never registered
  await createItem(page, { title: 'A local item' });
  await page.click('Khoá');
  const before = await db(page);
  assert.match(await login(page, { username: bee, password: 'wrong' }), /Sai username/);
  assert.deepEqual(await db(page), before);
  await page.click('Quay lại');
  const sessions = server.sql('SELECT COUNT(*) AS n FROM dt_session')[0].n;
  assert.equal(await login(page, { username: bee, password: PW_B }), 'choose');
  await page.waitText('một tài khoản chưa đăng ký');
  assert.equal(server.sql('SELECT COUNT(*) AS n FROM dt_session')[0].n, sessions + 1);
  await page.click('Huỷ');
  await page.waitFor(`!document.querySelector('dialog[open]')`);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(server.sql('SELECT COUNT(*) AS n FROM dt_session')[0].n, sessions, 'the new session was ended');
  assert.deepEqual(await db(page), before);
  await page.click('Quay lại');
  await unlock(page);
  await page.waitText('A local item');
  env.ac11 = { bee, page };
});

test('KM-006 AC12 FR09 replace needs the word when A has data not on the server; then nothing of A remains', async () => {
  const { bee, page } = env.ac11;
  const old = await db(page);
  await page.click('Khoá');
  assert.equal(await login(page, { username: bee, password: PW_B }), 'choose');
  assert.equal(await page.eval(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Thay thế').disabled`), true);
  await page.fill('Gõ XOÁ để xác nhận', 'XOA');
  assert.equal(await page.eval(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Thay thế').disabled`), true);
  await page.fill('Gõ XOÁ để xác nhận', 'XOÁ');
  await page.click('Thay thế');
  await page.waitFor(page.find('Khoá'), { timeout: 30000 });
  await page.waitText(`Item of ${bee}`);
  const stores = await page.eval(READ_STORES);
  for (const needle of [old.rows[0].id, old.account.deviceId, old.account.wrappedAccountKey.ct, old.rows[0].current.envelope.ct]) assert.ok(!stores.includes(needle));
  // Registered and clean: one confirmation, no word.
  const ant = await registeredDevice('ac12-ant', newUsername('ant'));
  await ant.click('Khoá');
  assert.equal(await login(ant, { username: bee, password: PW_B }), 'choose');
  assert.equal(await ant.eval(`!!document.querySelector('dialog[open] input')`), false);
  assert.equal(await ant.eval(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Thay thế').disabled`), false);
  await ant.click('Huỷ');
});
