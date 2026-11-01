import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, setup, unlock, addProject, createItem, fieldOrderOnScreen } from '../../testkit/e2e/driver.mjs';
import { ITEM_TEMPLATES, ITEM_TYPES } from '../../src/public/js/core/model.js';

let app;
let page;
before(async () => {
  app = await startApp();
  page = await app.newPage();
  await page.waitText('Tạo tài khoản');
  await setup(page);
  await addProject(page, 'PaymentGW', 'uat, staging');
  await addProject(page, 'CRM', 'uat');
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  assert.deepEqual(csp, [], 'AC45 no CSP violation in this file');
});

const LABELS = { login: 'Login', api_key: 'API key', token: 'Token', ssh: 'SSH', db: 'Database', server: 'Server', vpn: 'VPN', doc: 'Doc', note: 'Note' };
const KINDS = { text: 'text', secret: 'secret', url: 'url', multi: 'multi', 'secret-multi': 'secret-multi', otp: 'otp' };
const detailText = () => page.eval(`document.querySelector('.detail').innerText`);
const goTo = (name) => page.click(name, { exact: false });

test('KM-003 AC16 FR20 all 9 types: template names, kinds and order; empty title cannot be saved', async () => {
  for (const type of ITEM_TYPES) {
    await page.click('Thêm item');
    await page.click(LABELS[type]);
    await page.waitFor(page.find('Tiêu đề'));
    const form = await page.eval(`[...document.querySelectorAll('.edit-field')].map((r) => ({ label: r.querySelector('input').value, kind: r.querySelector('select').value }))`);
    assert.deepEqual(form, ITEM_TEMPLATES[type].map((t) => ({ label: t.label, kind: KINDS[t.kind] })), type);
    await page.click('Lưu');
    await page.waitText('Tiêu đề không được trống');
    await page.fill('Tiêu đề', `Type ${type}`);
    await page.click('Lưu');
    await page.waitFor(`document.querySelector('h2[data-fk=detail-title]')?.textContent === 'Type ${type}'`);
  }
  await page.shot('types-detail');
});

test('KM-003 AC17 FR21 add otp, remove, reorder, file field to text: correct after lock and unlock', async () => {
  await page.click('Type vpn');
  await page.click('Sửa');
  await page.select('Kiểu field mới', 'otp');
  await page.click('Thêm field');
  await page.fill('Giá trị Mã OTP (2FA)', 'JBSWY3DPEHPK3PXP');
  await page.click('Xoá Server');
  await page.select('Kiểu Cấu hình', 'text');
  await page.click('Đưa Cấu hình lên');
  await page.click('Lưu');
  await page.waitText('Mã OTP (2FA)');
  const want = ['Username', 'Cấu hình', 'Password', 'Mã OTP (2FA)'];
  assert.deepEqual(await fieldOrderOnScreen(page), want);
  await page.click('Khoá');
  await unlock(page);
  await page.click('Type vpn');
  await page.waitText('Sửa');
  assert.deepEqual(await fieldOrderOnScreen(page), want);
  assert.equal(await page.has('Tải client.ovpn'), false);
});

test('KM-003 AC18 FR22 FR23 FR26 one item in three envs: an edit shows everywhere; chip is right', async () => {
  await createItem(page, { title: 'Partner X', values: { Username: 'acme', Password: 'old-pass' }, envs: ['PaymentGW / uat', 'PaymentGW / staging', 'CRM / uat'] });
  await page.click('Sửa');
  await page.fill('Giá trị Password', 'new-pass');
  await page.click('Lưu');
  await page.waitText('Dùng chung');
  const seeNew = async () => {
    await page.click('Partner X');
    await page.click('Hiện Password');
    await page.waitText('new-pass');
  };
  const envButtons = await page.eval(`[...document.querySelectorAll('.nav-item.env')].map((b) => b.getAttribute('aria-label'))`);
  assert.equal(envButtons.length, 3);
  for (const name of envButtons) {
    await page.click(name);
    await seeNew();
  }
  await goTo('PaymentGW, ');
  await page.click('Partner X');
  await page.waitText('Dùng chung: uat, staging (+1 project khác)');
  await page.shot('shared-chip');
});

test('KM-003 FR22 a new item made while filtering by env has it selected', async () => {
  const name = await page.eval(`[...document.querySelectorAll('.nav-item.env')].map((b) => b.getAttribute('aria-label'))[1]`);
  await page.click(name);
  await page.click('Thêm item');
  await page.click('Note');
  assert.equal(await page.eval(`${page.find('PaymentGW / staging')}.checked`), true);
  await page.click('Huỷ');
});

test('KM-003 AC21 FR24 fork for staging: separate items, each edit stays on its side', async () => {
  await goTo('Tất cả, ');
  await createItem(page, { title: 'Forkable', values: { Password: 'shared-pass' }, envs: ['PaymentGW / uat', 'PaymentGW / staging'] });
  await page.click('Fork');
  await page.click('PaymentGW / staging');
  await page.click('Tách item');
  await page.waitFor(`document.querySelector('[data-fk=fork-origin]')`, { what: 'fork origin link' });
  const text = await detailText();
  assert.match(text, /Tách từ: Forkable/);
  assert.match(text, /PaymentGW \/ staging/);
  assert.doesNotMatch(text, /PaymentGW \/ uat/);
  assert.doesNotMatch(text, /Dùng chung/);
  await page.click('Lịch sử');
  await page.waitText('chưa có bản cũ');
  await page.click('Đóng');
  await page.click('Sửa');
  await page.fill('Giá trị Password', 'fork-pass');
  await page.click('Lưu');
  await page.waitFor(`document.querySelector('[data-fk=fork-origin]')`);
  await page.click('Tách từ: Forkable');
  await page.waitFor(`!document.querySelector('[data-fk=fork-origin]')`);
  await page.click('Hiện Password');
  await page.waitText('shared-pass');
  assert.match(await detailText(), /PaymentGW \/ uat/);
  assert.doesNotMatch(await detailText(), /PaymentGW \/ staging/);
  await page.click('Sửa');
  await page.fill('Giá trị Password', 'origin-pass');
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('form.stack')`);
  const rows = await page.eval(`[...document.querySelectorAll('.list .row')].filter((r) => r.getAttribute('aria-label') === 'Forkable').length`);
  assert.equal(rows, 2);
  await page.eval(`[...document.querySelectorAll('.list .row')].filter((r) => r.getAttribute('aria-label') === 'Forkable').find((r) => !r.classList.contains('on')).click()`);
  await page.waitFor(`document.querySelector('[data-fk=fork-origin]')`);
  await page.click('Hiện Password');
  await page.waitText('fork-pass');
});

test('KM-003 AC22 FR24 an item with one live env has no Fork, even with a deleted env left', async () => {
  await createItem(page, { title: 'Lonely', envs: ['PaymentGW / uat'] });
  assert.equal(await page.has('Fork'), false);
  await addProject(page, 'Temp', 'gone');
  await page.click('Sửa');
  await page.click('Temp / gone');
  await page.click('Lưu');
  await page.waitFor(page.find('Fork'));
  await page.click('Quản lý project Temp');
  await page.click('Xoá project');
  await page.waitText('item đang gán');
  await page.click('Xoá project');
  await page.waitFor(`!document.querySelector('dialog[open]')`);
  await page.click('Lonely');
  await page.waitFor(`!${page.find('Fork')}`, { what: 'no Fork button' });
});

test('KM-003 AC23 FR25 duplicate: cancel makes nothing; save makes an independent item', async () => {
  await page.click('Lonely');
  await page.click('Nhân bản');
  assert.equal(await page.value('Tiêu đề'), 'Lonely (bản sao)');
  await page.click('Huỷ');
  await page.waitFor(`!document.querySelector('form.stack')`);
  assert.equal(await page.has('Lonely (bản sao)'), false);
  await page.click('Nhân bản');
  await page.click('Lưu');
  await page.waitFor(page.find('Lonely (bản sao)'));
  await page.click('Lịch sử');
  await page.waitText('chưa có bản cũ');
  await page.click('Đóng');
  const text = await detailText();
  assert.match(text, /PaymentGW \/ uat/);
  assert.doesNotMatch(text, /Tách từ/);
});

test('KM-003 AC20 FR23 a failed write: failure shown, draft kept, no "saved"; reopening shows the old version', async () => {
  await createItem(page, { title: 'Fragile', values: { Password: 'first-version' } });
  await page.click('Sửa');
  await page.fill('Giá trị Password', 'never-written');
  await page.eval(`window.__put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function put() { throw new DOMException('x', 'QuotaExceededError'); }; 0`);
  await page.click('Lưu');
  await page.waitText('Lưu thất bại');
  assert.equal(await page.value('Giá trị Password'), 'never-written');
  assert.ok(!(await page.text()).includes('Đã lưu'));
  await page.eval(`IDBObjectStore.prototype.put = window.__put; 0`);
  await page.reload();
  await unlock(page);
  await page.click('Fragile');
  await page.click('Hiện Password');
  await page.waitText('first-version');
});

test('KM-003 AC24 FR27 history: time, reason, diff; a masked value is not in the DOM until pressed', async () => {
  await createItem(page, { title: 'Versioned', values: { Password: 'pass-old', Username: 'user-one' } });
  await page.click('Sửa');
  await page.select('Kiểu field mới', 'otp');
  await page.click('Thêm field');
  await page.fill('Giá trị Mã OTP (2FA)', 'JBSWY3DP');
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('form.stack')`);
  await page.click('Sửa');
  await page.fill('Giá trị Password', 'pass-new');
  await page.fill('Giá trị Mã OTP (2FA)', 'GEZDGNBV');
  await page.fill('Ghi chú', 'note-new');
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('form.stack')`);
  await page.click('Lịch sử');
  await page.waitText('Sửa');
  const dump = await page.eval(`document.querySelector('dialog[open]').outerHTML`);
  assert.ok(!dump.includes('pass-old') && !dump.includes('pass-new'), 'masked diff absent from the DOM');
  assert.ok(!dump.includes('JBSWY3DP') && !dump.includes('GEZDGNBV'), 'otp secret absent');
  assert.match(await page.eval(`document.querySelector('dialog[open]').innerText`), /Đã đổi/);
  assert.match(await page.eval(`document.querySelector('dialog[open]').innerText`), /note-new/);
  await page.click('Hiện giá trị Password');
  await page.waitText('pass-old');
  await page.waitText('pass-new');
  const after = await page.eval(`document.querySelector('dialog[open]').outerHTML`);
  assert.ok(!after.includes('JBSWY3DP'));
  await page.shot('history');
  await page.click('Đóng');
});

test('KM-003 AC25 FR28 restore: values back, assignments unchanged, deleted field returns, reason restore', async () => {
  await createItem(page, { title: 'Restorable', values: { Username: 'u1', Password: 'p1' }, envs: ['PaymentGW / uat'] });
  await page.click('Sửa');
  await page.fill('Tiêu đề', 'Renamed');
  await page.click('Xoá Username');
  await page.click('PaymentGW / staging');
  await page.click('Lưu');
  await page.waitFor(`document.querySelector('h2[data-fk=detail-title]')?.textContent === 'Renamed'`);
  await page.click('Lịch sử');
  await page.click('Khôi phục bản này');
  await page.waitFor(`document.querySelector('h2[data-fk=detail-title]')?.textContent === 'Restorable'`);
  const text = await detailText();
  assert.match(text, /Username/);
  assert.match(text, /u1/);
  assert.match(text, /PaymentGW \/ staging/, 'assignments stay as they are now');
  await page.click('Lịch sử');
  await page.waitText('Khôi phục');
  assert.equal(await page.eval(`[...document.querySelectorAll('dialog[open] .hist-entry')][0].querySelector('.chip').textContent`), 'Khôi phục');
  await page.click('Đóng');
});

test('KM-003 AC24 25 saves keep 20 versions', async () => {
  await createItem(page, { type: 'Note', title: 'Busy' });
  for (let n = 0; n < 25; n++) {
    await page.click('Sửa');
    await page.fill('Ghi chú', `n${n}`);
    await page.click('Lưu');
    await page.waitFor(`!document.querySelector('form.stack')`);
  }
  await page.click('Lịch sử');
  await page.waitFor(`document.querySelectorAll('dialog[open] .hist-entry').length === 20`);
  await page.click('Đóng');
});

test('KM-003 FR23 leaving a changed form asks first', async () => {
  await page.click('Sửa');
  await page.fill('Ghi chú', 'unsaved');
  await page.click('Restorable');
  await page.waitText('Bỏ bản nháp?');
  await page.click('Huỷ');
  assert.equal(await page.value('Ghi chú'), 'unsaved');
  await page.click('Restorable');
  await page.click('Bỏ bản nháp');
  await page.waitFor(`!document.querySelector('form.stack')`);
});

const listTitles = () => page.eval(`[...document.querySelectorAll('.list .row')].map((r) => r.getAttribute('aria-label'))`);
const dateIn = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('KM-003 AC26 FR29 FR30 expiry on the real screen: N−1, N, N+14 listed, N+15 not; chip wording', async () => {
  for (const [title, days, chip] of [['Exp -1', -1, 'Đã hết hạn'], ['Exp 0', 0, 'Hết hạn hôm nay'], ['Exp 14', 14, 'Còn 14 ngày'], ['Exp 15', 15, 'Còn 15 ngày']]) {
    await page.click('Thêm item');
    await page.click('Note');
    await page.fill('Tiêu đề', title);
    await page.eval(`(() => { const el = ${page.find('Ngày hết hạn')}; el.value = '${dateIn(days)}'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.click('Lưu');
    await page.waitText(chip);
  }
  await goTo('Sắp hết hạn, ');
  await page.waitFor(page.find('Exp 14'));
  const titles = await listTitles();
  assert.deepEqual(titles.filter((t) => t.startsWith('Exp')).sort(), ['Exp -1', 'Exp 0', 'Exp 14']);
  await page.click('Exp 14');
  await page.click('Sửa');
  await page.click('Bỏ hạn');
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('form.stack')`);
  await page.waitNoText('Còn 14 ngày');
});

test('KM-003 AC13 AC40 FR15 FR43 deleting a project with 3 items: asks with 3; 2 go to Chưa gán, 1 stays elsewhere; empty filter says so', async () => {
  await goTo('Tất cả, ');
  await addProject(page, 'Gone', 'g1, g2');
  await addProject(page, 'Stay', 's1');
  await createItem(page, { type: 'Note', title: 'Del one', envs: ['Gone / g1'] });
  await createItem(page, { type: 'Note', title: 'Del two', envs: ['Gone / g1', 'Gone / g2'] });
  await createItem(page, { type: 'Note', title: 'Del three', envs: ['Gone / g2', 'Stay / s1'] });
  await page.click('Quản lý project Gone');
  await page.click('Xoá project');
  await page.waitText('3 item đang gán');
  await page.click('Xoá project');
  await page.waitFor(`!document.querySelector('dialog[open]')`);
  assert.equal(await page.eval(`[...document.querySelectorAll('.nav-item')].some((b) => b.getAttribute('aria-label').startsWith('Gone') || b.getAttribute('aria-label').startsWith('g1'))`), false);
  await goTo('Chưa gán, ');
  await page.waitFor(page.find('Del one'));
  const un = await listTitles();
  assert.ok(un.includes('Del one') && un.includes('Del two') && !un.includes('Del three'));
  await goTo('Stay, ');
  await page.waitFor(page.find('Del three'));
  await page.click('Quản lý project Stay');
  await page.fill('Tên env mới', 'empty-env');
  await page.click('Thêm env');
  await page.waitFor(page.find('Tên env empty-env'));
  await page.click('Xong');
  await goTo('empty-env, ');
  await page.waitText('Chưa có item nào ở đây');
});

test('KM-003 AC41 FR44 Cmd/Ctrl+K, accents folded, secrets not searched', async () => {
  await goTo('Tất cả, ');
  await createItem(page, { type: 'Note', title: 'Mật khẩu VPN' });
  await page.click('Sửa');
  await page.select('Kiểu field mới', 'text');
  await page.click('Thêm field');
  await page.fill('Giá trị Văn bản', 'đà nẵng');
  await page.select('Kiểu field mới', 'secret');
  await page.click('Thêm field');
  await page.fill('Giá trị Bí mật', 'zebra');
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('form.stack')`);
  await page.key('k', { code: 'KeyK', modifiers: process.platform === 'darwin' ? 4 : 2 });
  await page.waitFor(`document.activeElement?.type === 'search'`);
  for (const [q, found] of [['mat khau', true], ['da nang', true], ['zebra', false]]) {
    await page.fill('Tìm kiếm', q);
    await page.waitFor(`document.querySelector('.list h2').textContent.includes(${JSON.stringify(q)})`);
    assert.equal((await listTitles()).includes('Mật khẩu VPN'), found, q);
  }
  await page.waitText('Không tìm thấy item nào');
  await page.fill('Tìm kiếm', '');
});
