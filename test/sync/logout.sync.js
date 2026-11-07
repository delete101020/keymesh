// KM-006 AC14–AC20: log out keeping or wiping the data, on real browsers against a real local server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { grepDir } from '../../testkit/e2e/driver.mjs';
import {
  PASSWORD,
  READ_DB_ALL,
  READ_STORES,
  REGISTRATION_TOKEN,
  createItem,
  login,
  newUsername,
  register,
  setup,
  startDevices,
  unlock,
  waitClean,
} from '../../testkit/sync-devices.mjs';

let env;
test.before(async () => {
  env = await startDevices({ names: [] });
});
test.after(() => env?.stop());

const db = (page) => page.eval(READ_DB_ALL);
let n = 0;
const fresh = async () => env.add(`d${++n}`);
// Going to the background and back: the app syncs at once on coming back (FR16).
const nudge = async (page) => {
  await page.setBackground(true);
  await page.setBackground(false);
};

// Two devices on one account, both open and clean. Returns their pages and the username.
async function pair() {
  const a = await fresh();
  await setup(a.page);
  await createItem(a.page, { title: 'Shared item', values: { Password: 'pw-shared' } });
  const username = newUsername('lo');
  assert.equal(await register(a.page, { username, token: REGISTRATION_TOKEN, password: PASSWORD }), '');
  await waitClean(a.page);
  const b = await fresh();
  assert.equal(await login(b.page, { username, password: PASSWORD }), 'main');
  return { A: a.page, B: b.page, profileA: a.app.profile, username };
}

async function chooseLogout(page, button) {
  await page.click('Cài đặt');
  await page.click('Đăng xuất');
  await page.click(button);
}

async function editTitle(page, from, to) {
  await page.click(from, { exact: false, selector: '.row,[role=button],button' });
  await page.click('Sửa');
  await page.fill('Tiêu đề', to);
  await page.click('Lưu');
  await page.waitFor(`document.querySelector('h2[data-fk=detail-title]')?.textContent === ${JSON.stringify(to)}`);
}

test('KM-006 AC14 FR10 FR11 FR15 log out keeping data: token refused, app locked, opens offline, sends nothing; the other device goes on', async () => {
  const { A, B } = await pair();
  const token = (await db(A)).session.token;
  await chooseLogout(A, 'Đăng xuất, giữ dữ liệu');
  await A.waitFor(A.find('Mở khoá'), { what: 'locked' });
  assert.equal((await env.server.call('GET', '/api/vaults', { token })).status, 401);
  assert.equal((await db(A)).session, null);
  await A.setOffline(true);
  await unlock(A);
  await A.waitText('Shared item');
  await A.setOffline(false);
  const before = A.apiCalls().length;
  await nudge(A);
  await createItem(A, { title: 'After logout' });
  await new Promise((r) => setTimeout(r, 3000));
  assert.equal(A.apiCalls().length, before, 'no sync request while logged out');
  await createItem(B, { title: 'B still syncs' });
  await waitClean(B);
});

test('KM-006 AC15 FR08 FR11 offline with a pending change: log out keeping data, edit more, log in again: all of it reaches the other device', async () => {
  const { A, B, username } = await pair();
  await A.setOffline(true);
  await createItem(A, { title: 'Pending one' });
  await chooseLogout(A, 'Đăng xuất, giữ dữ liệu');
  await A.waitText('Phiên trên server chưa huỷ');
  await unlock(A);
  await A.waitFor(`document.getElementById('toast').hidden`, { what: 'warning toast gone (it sits over the Save button)', timeout: 10000 });
  await createItem(A, { title: 'Pending two' });
  await A.setOffline(false);
  await A.click('Khoá');
  assert.equal(await login(A, { username, password: PASSWORD }), 'main');
  await waitClean(A);
  await nudge(B);
  await B.waitText('Pending two', { timeout: 30000 });
  await B.waitText('Pending one');
});

test('KM-006 AC16 FR12 offline with N pending: wiping warns with N; cancel and keep lose nothing; no word, no wipe', async () => {
  const { A } = await pair();
  await A.setOffline(true);
  await createItem(A, { title: 'Offline one' });
  await createItem(A, { title: 'Offline two' });
  await chooseLogout(A, 'Đăng xuất và xoá dữ liệu');
  await A.waitText('2 thay đổi chưa lên server sẽ mất vĩnh viễn');
  const wipeButton = `[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Xoá dữ liệu trên máy này')`;
  assert.equal(await A.eval(`${wipeButton}.disabled`), true);
  await A.click('Huỷ');
  await A.waitText('Offline two');
  await chooseLogout(A, 'Đăng xuất và xoá dữ liệu');
  await A.waitText('2 thay đổi');
  await A.click('Đăng xuất, giữ dữ liệu');
  await A.waitFor(A.find('Mở khoá'));
  await unlock(A);
  await A.waitText('Offline two');
  assert.ok((await db(A)).rows[0].current.dirty);
});

test('KM-006 AC17 FR12 online with pending: pushed first, no warning, wiped; a server refusing it brings the warning', async () => {
  const one = await pair();
  await one.A.setOffline(true);
  await createItem(one.A, { title: 'Pushed before wipe' });
  await one.A.setOffline(false);
  await chooseLogout(one.A, 'Đăng xuất và xoá dữ liệu');
  await one.A.waitFor(one.A.find('Tạo tài khoản'), { what: 'empty-device screen', timeout: 30000 });
  await nudge(one.B);
  await one.B.waitText('Pushed before wipe', { timeout: 30000 });

  const two = await pair();
  await two.A.setOffline(true);
  await createItem(two.A, { title: 'Refused' });
  await two.A.setOffline(false);
  const off = await two.A.intercept('*/api/vaults/*', (req) => (req.method === 'PUT' ? { status: 500, body: { error: 'internal', message: 'x' } } : 'continue'));
  await chooseLogout(two.A, 'Đăng xuất và xoá dữ liệu');
  await two.A.waitText('1 thay đổi chưa lên server', { timeout: 30000 });
  await off();
  await two.A.click('Huỷ');
});

test('KM-006 AC18 FR13 FR14 NFR04 wipe: empty-device screen, nothing of the account in any storage, a passkey reminder; the other device goes on', async () => {
  const { A, B, profileA, username } = await pair();
  // A passkey record as KM-007 would store it, settings and recents (FR13).
  await A.eval(`new Promise((res, rej) => { const o = indexedDB.open('keymesh'); o.onsuccess = () => { const tx = o.result.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ credentialId: 'km006-cred', prfSalt: 'km006-salt', wrappedAccountKey: { iv: 'x', ct: 'km006-passkey' } }, 'passkey'); tx.oncomplete = () => { o.result.close(); res(); }; tx.onerror = () => rej(tx.error); }; })`);
  await A.click('Shared item', { exact: false, selector: '.row,[role=button],button' });
  const before = await db(A);
  const needles = [username, before.account.userId, before.session.token, before.account.deviceId, before.rows[0].id, before.rows[0].current.envelope.ct, before.account.wrappedAccountKey.ct, 'km006-passkey'];
  await chooseLogout(A, 'Đăng xuất và xoá dữ liệu');
  await A.waitFor(A.find('Tạo tài khoản'), { what: 'empty-device screen', timeout: 30000 });
  await A.waitText('Passkey đã lưu trong hệ điều hành');
  const stores = await A.eval(READ_STORES);
  assert.deepEqual(needles.filter((x) => stores.includes(x)), []);
  // On-disk leftovers of the profile are measured, not asserted: clear() does not rewrite LevelDB files at once (plan §4).
  env.leftovers = await grepDir(profileA, needles.slice(0, 5));
  console.log(`KM-006 AC18 profile files still holding a wiped value: ${env.leftovers.length}`);
  await createItem(B, { title: 'B after A wiped' });
  await waitClean(B);
});

test('KM-006 AC19 FR14 the passkey record never leaves in a request; same-account login and logout keep it', async () => {
  const { A, username } = await pair();
  const bodies = [];
  await A.intercept('*/api/*', (req) => (bodies.push(req.body ?? ''), 'continue'));
  await A.eval(`new Promise((res) => { const o = indexedDB.open('keymesh'); o.onsuccess = () => { const tx = o.result.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ credentialId: 'km006-cred-19', prfSalt: 's', wrappedAccountKey: { iv: 'x', ct: 'km006-passkey-19' } }, 'passkey'); tx.oncomplete = () => { o.result.close(); res(); }; }; })`);
  await createItem(A, { title: 'With passkey' });
  await waitClean(A);
  await chooseLogout(A, 'Đăng xuất, giữ dữ liệu');
  await A.waitFor(A.find('Mở khoá'));
  assert.equal(await login(A, { username, password: PASSWORD }), 'main');
  assert.equal((await db(A)).passkey.wrappedAccountKey.ct, 'km006-passkey-19');
  assert.ok(bodies.length > 0 && !bodies.join('\n').includes('km006-passkey-19') && !bodies.join('\n').includes('km006-cred-19'));
});

test('KM-006 AC20 FR13 a second tab on the lock screen during a wipe: the wipe finishes, that tab goes to the empty device', async () => {
  const a = await fresh();
  await setup(a.page);
  const username = newUsername('tab');
  await createItem(a.page, { title: 'Tab item' });
  assert.equal(await register(a.page, { username, token: REGISTRATION_TOKEN, password: PASSWORD }), '');
  await waitClean(a.page);
  const other = await a.app.newPage();
  await other.waitFor(other.find('Mở khoá'), { what: 'second tab locked' });
  await chooseLogout(a.page, 'Đăng xuất và xoá dữ liệu');
  await a.page.waitFor(a.page.find('Tạo tài khoản'), { timeout: 30000 });
  await other.waitFor(other.find('Tạo tài khoản'), { what: 'second tab back to the empty device', timeout: 10000 });
  await setup(other, 'new owner password here');
  const stores = await other.eval(READ_STORES);
  assert.ok(!stores.includes(username) && !stores.includes('Tab item'));
});
