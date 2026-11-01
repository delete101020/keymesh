// Whole-app checks: theme, layout, forbidden features, leaks, network, injection, keyboard-only flow.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, setup, unlock, addProject, createItem, grepDir, PASSWORD, READ_DB } from '../../testkit/e2e/driver.mjs';

const MARK = 'ZQMARK';
const XSS = '<img src=x onerror=alert(1)>';
let app;
let page;
before(async () => {
  app = await startApp();
  page = await app.newPage();
  await page.waitText('Tạo tài khoản');
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  assert.deepEqual(csp, [], 'AC45 no CSP violation in this file');
});

const noHorizontalScroll = () => page.eval(`document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.body.scrollWidth <= document.body.clientWidth`);
// Every button and link now visible must be at least 44×44.
const smallTargets = () => page.eval(`(() => {
  const root = document.querySelector('dialog[open]') ?? document;
  return [...root.querySelectorAll('button,a.icon-link')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); })
    .map((el) => (el.getAttribute('aria-label') || el.innerText) + ' ' + Math.round(el.getBoundingClientRect().width) + '×' + Math.round(el.getBoundingClientRect().height));
})()`);
const checkNarrow = async (where) => {
  assert.equal(await noHorizontalScroll(), true, `no sideways scroll: ${where}`);
  assert.deepEqual(await smallTargets(), [], `touch targets: ${where}`);
};
const pane = () => page.eval(`document.querySelector('.cols').dataset.pane`);

test('KM-003 AC51 NFR10 flow 3.1 by keyboard only, with focus always visible', async () => {
  const typeIn = async (text) => page.send('Input.insertText', { text });
  const enter = () => page.key('Enter', { text: '\r' });
  const assertFocusVisible = async () => {
    const r = await page.eval(`(() => { const el = document.activeElement; if (!el || el === document.body) return 'body'; const s = getComputedStyle(el); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? 'ok' : 'none:' + el.tagName + ':' + (el.getAttribute('aria-label') || ''); })()`);
    assert.equal(r, 'ok');
  };
  // 1. Setup: the first box already has focus.
  await page.waitFor(`document.activeElement?.type === 'password'`);
  await typeIn(PASSWORD);
  await page.key('Tab');
  await typeIn(PASSWORD);
  await enter();
  await page.waitFor(page.find('Khoá'));
  // 3. A project, by keyboard.
  await page.tabTo('Thêm project');
  await assertFocusVisible();
  await enter();
  await page.waitFor(`document.querySelector('dialog[open]')`);
  await typeIn('Payment GW');
  await enter();
  await page.waitFor(`!document.querySelector('dialog[open]')`);
  // An item in uat and staging.
  await page.tabTo('Thêm item');
  await enter();
  await page.waitFor(page.find('Login'));
  await page.tabTo('Login');
  await enter();
  await page.waitFor(`document.activeElement === ${page.find('Tiêu đề')}`);
  await typeIn('Partner X');
  await page.tabTo('Giá trị Password');
  await typeIn('old-secret');
  await page.tabTo('Payment GW / uat');
  await page.key(' ', { code: 'Space', text: ' ' });
  await page.tabTo('Payment GW / staging');
  await assertFocusVisible();
  await page.key(' ', { code: 'Space', text: ' ' });
  await page.tabTo('Lưu');
  await enter();
  await page.waitFor(`document.activeElement?.textContent === 'Partner X'`, { what: 'focus on the saved item title' });
  await page.waitText('Dùng chung');
  // 4. Edit once.
  await page.tabTo('Sửa');
  await enter();
  await page.waitFor(page.find('Giá trị Password'));
  await page.tabTo('Giá trị Password');
  await page.eval(`document.activeElement.select()`);
  await typeIn('new-secret');
  await page.tabTo('Lưu');
  await enter();
  await page.waitFor(`document.activeElement?.textContent === 'Partner X'`);
  // 5. Fork.
  await page.tabTo('Fork');
  await enter();
  await page.waitFor(page.find('Tách item'));
  await page.tabTo('Tách item');
  await enter();
  await page.waitFor(`document.querySelector('[data-fk=fork-origin]')`);
  // 6. Search and copy.
  await app.grantClipboard();
  await page.key('k', { code: 'KeyK', modifiers: process.platform === 'darwin' ? 4 : 2 });
  await page.waitFor(`document.activeElement?.type === 'search'`, { what: 'Cmd/Ctrl+K focuses search' });
  await typeIn('partner');
  await page.waitFor(`document.querySelectorAll('.list .row').length === 2`);
  await page.tabTo('Partner X');
  await enter();
  await page.waitFor(`document.activeElement?.dataset.fk === 'detail-title'`);
  await page.tabTo('Copy Password');
  await assertFocusVisible();
  await enter();
  await page.waitText('Sẽ xoá khỏi clipboard sau 30 giây');
  // 7. Lock.
  await page.tabTo('Khoá', { shift: true });
  await enter();
  await page.waitFor(`document.activeElement?.type === 'password'`, { what: 'focus on the password box after locking' });
  await page.send('Input.insertText', { text: PASSWORD });
  await enter();
  await page.waitFor(page.find('Khoá'));
});

test('KM-003 NFR10 every input and icon-only button has a name', async () => {
  await page.click('Thêm item');
  await page.click('Login');
  await page.waitFor(page.find('Tiêu đề'));
  const nameless = await page.eval(`[...document.querySelectorAll('button,input,select,textarea,a')].filter((el) => {
    if (el.type === 'file') return !el.getAttribute('aria-label');
    return !(el.getAttribute('aria-label') || (el.labels && el.labels.length) || (el.innerText || '').trim());
  }).map((el) => el.outerHTML.slice(0, 100))`);
  assert.deepEqual(nameless, []);
  await page.click('Huỷ');
});

test('KM-003 AC42 FR45 the theme follows the system at once, without a reload', async () => {
  await page.eval(`window.__noReload = true`);
  const bg = () => page.eval(`getComputedStyle(document.body).backgroundColor`);
  await page.colorScheme('light');
  const light = await bg();
  await page.colorScheme('dark');
  const dark = await bg();
  assert.notEqual(light, dark);
  assert.equal(dark, 'rgb(18, 20, 23)');
  assert.equal(await page.eval(`window.__noReload`), true);
  await page.shot('main-1280-dark');
  await page.colorScheme('light');
  await page.shot('main-1280-light');
});

test('KM-003 AC43 FR46 900 px has 3 columns', async () => {
  await page.viewport(900);
  const cols = await page.eval(`getComputedStyle(document.querySelector('.cols')).gridTemplateColumns.split(' ').length`);
  assert.equal(cols, 3);
  assert.equal(await page.eval(`[...document.querySelectorAll('.side,.list,.detail')].every((e) => e.getBoundingClientRect().width > 0)`), true);
  assert.equal(await noHorizontalScroll(), true);
});

for (const width of [899, 360]) {
  test(`KM-003 AC43 FR46 NFR09 ${width} px stacks; flow 3.1 works; no sideways scroll; targets ≥ 44 px`, async () => {
    await page.viewport(width);
    assert.equal(await page.eval(`getComputedStyle(document.querySelector('.cols')).gridTemplateColumns.split(' ').length`), 1);
    if ((await pane()) === 'detail') await page.click('Quay lại');
    if ((await pane()) === 'list') await page.click('Quay lại');
    assert.equal(await pane(), 'nav');
    await checkNarrow('nav');
    await page.shot(`nav-${width}`);
    const project = `W${width}`;
    await addProject(page, project, 'uat, staging');
    await page.click('Quản lý project ' + project);
    await checkNarrow('manage dialog');
    await page.shot(`manage-${width}`);
    await page.click('Xong');
    await page.click('Tất cả', { exact: false });
    assert.equal(await pane(), 'list');
    await checkNarrow('list');
    await page.click('Thêm item');
    assert.equal(await pane(), 'detail');
    await page.waitFor(page.find('Login'));
    await checkNarrow('type picker');
    await page.shot(`pick-${width}`);
    await page.click('Login');
    await page.fill('Tiêu đề', `Item ${width} with a rather long title that has to wrap on a narrow screen without scrolling`);
    await page.fill('Giá trị Password', 'narrow-old');
    await page.fill('Giá trị URL', `https://very-long-host-name-that-must-wrap.example/${'x'.repeat(120)}`);
    await page.select('Kiểu field mới', 'otp');
    await page.click('Thêm field');
    await page.fill('Giá trị Mã OTP (2FA)', 'JBSWY3DP');
    await page.select('Kiểu field mới', 'secret-multi');
    await page.click('Thêm field');
    await page.fill('Ghi chú', 'a-very-long-note-'.repeat(20));
    await page.click(`${project} / uat`);
    await page.click(`${project} / staging`);
    await checkNarrow('form');
    await page.shot(`form-${width}`);
    await page.click('Sinh mật khẩu cho Password');
    await checkNarrow('generator');
    await page.click('Đóng');
    await page.click('Lưu');
    await page.waitFor(`document.querySelector('[data-fk=detail-title]')`);
    await checkNarrow('detail');
    await page.shot(`detail-${width}`);
    await page.click('Sửa');
    await page.fill('Giá trị Password', 'narrow-new');
    await page.click('Lưu');
    await page.waitFor(`!document.querySelector('form.stack')`);
    await page.click('Lịch sử');
    await checkNarrow('history');
    await page.click('Hiện giá trị Password');
    await page.waitText('narrow-new');
    await checkNarrow('history revealed');
    await page.shot(`history-${width}`);
    await page.click('Đóng');
    await page.click('Fork');
    await checkNarrow('fork dialog');
    await page.click('Tách item');
    await page.waitFor(`document.querySelector('[data-fk=fork-origin]')`);
    await page.click('Quay lại');
    assert.equal(await pane(), 'list');
    await page.fill('Tìm kiếm', `item ${width}`);
    await page.waitFor(`document.querySelectorAll('.list .row').length === 2`);
    await page.click('Quay lại');
    await page.fill('Tìm kiếm', '');
    await page.viewport(1280);
    await page.click('Khoá');
    await page.waitFor(page.find('Mở khoá'));
    await page.viewport(width);
    await page.shot(`unlock-${width}`);
    assert.equal(await noHorizontalScroll(), true);
    await page.viewport(1280);
    await unlock(page);
    await page.viewport(width);
  });
}

test('KM-003 AC44 FR47 no screen offers an out-of-scope feature', async () => {
  await page.viewport(1280);
  const banned = /yêu thích|thùng rác|đăng nhập|đăng xuất|đồng bộ|backup|sao lưu|import|export|passkey|vân tay|đổi mật khẩu|chọn vault|thời gian khoá|^tag$|^xoá item$|cài đặt/i;
  const names = async (where) => {
    const list = await page.eval(`window.__names()`);
    for (const n of list) assert.doesNotMatch(n, banned, `${where}: ${n}`);
    assert.doesNotMatch(await page.text(), /thùng rác|yêu thích|đồng bộ|đăng nhập/i, where);
  };
  await names('main');
  await page.click('Tất cả', { exact: false });
  const first = await page.eval(`document.querySelector('.list .row').getAttribute('aria-label')`);
  await page.click(first);
  await names('detail');
  await page.click('Sửa');
  await names('form');
  await page.click('Huỷ');
  await page.click('Lịch sử');
  await names('history');
  await page.click('Đóng');
  await page.click('Thêm project');
  await names('add project');
  await page.click('Huỷ');
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  await names('lock');
  await unlock(page);
});

test('KM-003 AC48 NFR05 an injection string in every input shows as text and creates nothing', async () => {
  await page.eval(`window.__alerted = 0; window.alert = () => { window.__alerted++; }; 0`);
  const x = XSS;
  await addProject(page, `P${x}`, `E${x}`);
  await page.click(`Quản lý project P${x}`);
  await page.select(`Màu env E${x}`, 'blue');
  await page.click('Xong');
  await page.click('Thêm item');
  await page.click('Login');
  await page.fill('Tiêu đề', `T${x}`);
  await page.fill('Tên field 1', `L${x}`);
  await page.fill(`Giá trị L${x}`, `V${x}`);
  await page.fill('Giá trị Password', `S${x}`);
  await page.fill('Giá trị URL', `javascript:alert(1)//${x}`);
  await page.fill('Ghi chú', `N${x}`);
  await page.click(`P${x} / E${x}`);
  await page.click('Lưu');
  await page.waitFor(`document.querySelector('[data-fk=detail-title]')?.textContent === 'T${x}'`);
  await page.click('Hiện Password');
  await page.waitText(`S${x}`);
  await page.click('Sửa');
  await page.fill('Tiêu đề', `T2${x}`);
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('form.stack')`);
  await page.click('Lịch sử');
  await page.waitText(`T${x}`);
  await page.click('Đóng');
  await page.fill('Tìm kiếm', x);
  await page.waitText(`Kết quả cho “${x}”`);
  const text = await page.text();
  for (const s of [`T2${x}`, `P${x}`, `E${x}`, `V${x}`, `N${x}`]) assert.ok(text.includes(s), s);
  assert.equal(await page.eval(`document.querySelectorAll('img').length`), 0);
  assert.equal(await page.eval(`[...document.querySelectorAll('*')].filter((e) => e.hasAttribute('onerror')).length`), 0);
  assert.equal(await page.eval(`window.__alerted`), 0);
  await page.fill('Tìm kiếm', '');
});

test('KM-003 AC46 NFR02 NFR03 markers in every input: after locking, nothing readable in any storage, the profile, console, errors or URLs', async () => {
  const m = (s) => `${MARK}${s}`;
  await addProject(page, m('PROJECT'), m('ENV'));
  await page.click('Thêm item');
  await page.click('Login');
  await page.fill('Tiêu đề', m('TITLE'));
  await page.fill('Giá trị Username', m('USER'));
  await page.fill('Giá trị Password', m('SECRET'));
  await page.fill('Ghi chú', m('NOTE'));
  await page.click(`${m('PROJECT')} / ${m('ENV')}`);
  await page.click('Lưu');
  await page.waitFor(`document.querySelector('[data-fk=detail-title]')?.textContent === '${m('TITLE')}'`);
  // A failed save and a wrong password are the error paths that could leak.
  await page.click('Sửa');
  await page.eval(`window.__put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function put() { throw new DOMException('x', 'QuotaExceededError'); }; 0`);
  await page.click('Lưu');
  await page.fill('Tiêu đề', m('TITLE2'));
  await page.click('Lưu');
  await page.waitText('Lưu thất bại');
  await page.eval(`IDBObjectStore.prototype.put = window.__put; 0`);
  await page.click('Huỷ');
  await page.click('Bỏ bản nháp');
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  await page.fill('Master password', `${MARK}WRONG`);
  await page.click('Mở khoá');
  await page.waitText('Sai mật khẩu');
  await page.fill('Master password', '');

  assert.ok(!(await page.domDump()).includes(MARK), 'DOM');
  const stored = await page.eval(`(async () => {
    const db = ${READ_DB};
    const caches_ = await caches.keys();
    return { db: await db, local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), caches: caches_ };
  })()`);
  const flat = JSON.stringify(stored);
  assert.ok(!flat.includes(MARK), 'IndexedDB, localStorage, sessionStorage');
  assert.ok(!flat.includes(PASSWORD));
  assert.deepEqual(stored.caches, []);
  assert.deepEqual(Object.keys(stored.db.account).sort(), ['deviceId', 'kdf', 'userId', 'username', 'wrappedAccountKey']);
  for (const line of [...page.console, ...page.errors, ...page.requests]) {
    assert.ok(!line.includes(MARK), `output: ${line.slice(0, 80)}`);
    assert.ok(!line.includes(PASSWORD));
  }

  // The files Chrome keeps on disk. Quit first so everything is flushed.
  await app.restartChrome();
  const hits = await grepDir(app.profile, [MARK, PASSWORD]);
  assert.deepEqual(hits, [], 'profile files');
  page = await app.newPage();
  await page.waitFor(page.find('Mở khoá'));
});

test('KM-003 AC47 NFR04 every request stays on the same origin', async () => {
  await unlock(page);
  const origin = new URL(app.url).origin;
  const away = page.requests.filter((u) => !u.startsWith(origin) && !/^(data|blob|about):/.test(u));
  assert.deepEqual(away, []);
});
