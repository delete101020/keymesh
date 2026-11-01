import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, unlock, addProject, READ_DB } from '../../testkit/e2e/driver.mjs';

let app;
let page;
before(async () => {
  app = await startApp();
  page = await app.newPage();
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  assert.deepEqual(csp, [], 'AC45 no CSP violation in this file');
});

const noAccount = async () => (await page.eval(READ_DB)).account === null;

test('KM-003 AC01 FR01 empty browser: setup with exactly two password inputs; mismatch or empty creates nothing', async () => {
  await page.waitText('Tạo tài khoản');
  assert.equal(await page.eval(`document.querySelectorAll('input').length`), 2);
  assert.equal(await page.eval(`document.querySelectorAll('input[type=password]').length`), 2);
  await page.click('Tạo tài khoản');
  await page.waitText('Hãy nhập master password');
  assert.ok(await noAccount());
  await page.fill('Master password', 'aaaaaaaaaaaaaaaa');
  await page.fill('Nhập lại master password', 'bbbbbbbbbbbbbbbb');
  await page.click('Tạo tài khoản');
  await page.waitText('Hai lần nhập không khớp');
  assert.ok(await noAccount());
});

test('KM-003 AC02 FR02 11 characters warn, 12 do not; both statements are always on screen', async () => {
  await page.fill('Master password', '12345678901');
  await page.waitText('ngắn hơn 12 ký tự');
  await page.fill('Master password', '123456789012');
  await page.waitNoText('ngắn hơn 12 ký tự');
  const text = await page.text();
  assert.match(text, /Không có cách khôi phục/);
  assert.match(text, /chỉ nằm trên trình duyệt này/);
  await page.shot('setup-light');
});

test('KM-003 AC04 FR03 a write failing midway leaves no account and setup comes back', async () => {
  await page.eval(`window.__add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function add(v, k) { if (this.name === 'vaults') throw new DOMException('x', 'QuotaExceededError'); return window.__add.call(this, v, k); }; 0`);
  await page.fill('Master password', 'password number one');
  await page.fill('Nhập lại master password', 'password number one');
  await page.click('Tạo tài khoản');
  await page.waitText('Không đọc hoặc ghi được bộ lưu trữ');
  assert.ok(await noAccount());
  await page.reload();
  await page.waitFor(page.find('Nhập lại master password'));
});

test('KM-003 AC02 AC03 FR03 FR04 11 characters can still create; stored data has the shape of docs/03 §3', async () => {
  const nfc = 'mệt'.normalize('NFC') + '12345678';
  assert.equal([...nfc].length, 11);
  await page.fill('Master password', nfc);
  await page.waitText('ngắn hơn 12 ký tự');
  await page.fill('Nhập lại master password', nfc);
  await page.click('Tạo tài khoản');
  await page.waitFor(page.find('Khoá'));
  const { account, rows } = await page.eval(READ_DB);
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(account).sort(), ['deviceId', 'kdf', 'userId', 'username', 'wrappedAccountKey']);
  assert.match(account.deviceId, /^d_[0-9a-f]{16}$/);
  assert.equal(account.userId, null);
  assert.equal(account.username, null);
  assert.ok(!JSON.stringify({ account, rows }).includes('authKey'));
  assert.equal(rows[0].current.dirty, true);
  assert.equal(rows[0].base, null);
});

test('KM-003 AC05 FR05 opened with the NFD form of the NFC password', async () => {
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  const nfd = 'mệt'.normalize('NFD') + '12345678';
  await unlock(page, nfd);
});

test('KM-003 AC06 FR06 FR07 FR09 after quitting Chrome: wrong password shows nothing and can retry; right one shows all; only same-origin requests', async () => {
  await addProject(page, 'Survive', 'dev');
  const pw = 'mệt'.normalize('NFC') + '12345678';
  await app.restartChrome();
  page = await app.newPage();
  await page.waitFor(page.find('Mở khoá'));
  await page.fill('Master password', 'wrong password');
  await page.click('Mở khoá');
  await page.waitText('Sai mật khẩu hoặc dữ liệu hỏng');
  assert.ok(!(await page.domDump()).includes('Survive'));
  await unlock(page, pw);
  await page.waitText('Survive');
  const origin = new URL(app.url).origin;
  assert.deepEqual(page.requests.filter((u) => !u.startsWith(origin) && !u.startsWith('about:') && !u.startsWith('data:')), []);
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
});

test('KM-003 AC07 FR08 one changed byte in the envelope: error, no data, stored row unchanged', async () => {
  const pw = 'mệt'.normalize('NFC') + '12345678';
  await page.eval(`new Promise((resolve, reject) => {
    const open = indexedDB.open('keymesh');
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('vaults', 'readwrite');
      const store = tx.objectStore('vaults');
      const req = store.getAll();
      req.onsuccess = () => {
        const row = req.result[0];
        window.__ct = row.current.envelope.ct;
        const b = [...atob(row.current.envelope.ct)];
        b[20] = String.fromCharCode(b[20].charCodeAt(0) ^ 1);
        row.current.envelope.ct = btoa(b.join(''));
        window.__broken = row.current.envelope.ct;
        store.put(row);
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  })`);
  const before = await page.eval(READ_DB);
  await page.fill('Master password', pw);
  await page.click('Mở khoá');
  await page.waitText('Không mở được vault');
  assert.equal(await page.has('Khoá'), false);
  assert.ok(!(await page.domDump()).includes('Survive'));
  assert.deepEqual(await page.eval(READ_DB), before);
});

test('KM-003 AC07 FR08 no CompressionStream: says unsupported, no setup screen', async () => {
  const other = await app.newPage('about:blank');
  await other.addInit('delete window.CompressionStream;');
  await other.goto(app.url);
  await other.waitText('Không chạy được KeyMesh');
  assert.match(await other.text(), /CompressionStream/);
  assert.equal(await other.has('Tạo tài khoản'), false);
  assert.equal(await other.has('Mở khoá'), false);
  await app.closePage(other);
});
