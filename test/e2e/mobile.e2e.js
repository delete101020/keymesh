// The app on a touch device at 360×640: background lock, settings, then navigation and the home screen.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, setup, unlock, createItem, addProject, READ_DB } from '../../testkit/e2e/driver.mjs';

const MARK = 'ZQBACKGROUND';
let app;
let page;
before(async () => {
  app = await startApp();
  page = await app.newPage();
  await page.phone();
  await page.reload();
  await page.waitText('Tạo tài khoản');
  await setup(page);
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  assert.deepEqual(csp, [], 'no CSP violation in this file');
});

const SEC = 1000;
const jump = (ms) => page.eval(`(() => { const real = Date.now.bind(Date); const base = window.__skew ?? 0; window.__skew = base + ${ms}; if (!window.__patched) { window.__patched = true; Date.now = () => real() + window.__skew; } })()`);
const shielded = () => page.eval(`document.body.hasAttribute('data-shield') && getComputedStyle(document.getElementById('root')).visibility === 'hidden' && getComputedStyle(document.getElementById('shield')).display === 'block'`);

test('KM-004 the driver really presents a touch device', async () => {
  assert.equal(await page.eval(`matchMedia('(hover: none) and (pointer: coarse)').matches`), true);
});

test('KM-004 AC06 in the background the content is covered, including an open dialog; 59 s comes back open', async () => {
  await page.click('Tất cả', { exact: false });
  await createItem(page, { title: MARK, values: { Password: 'bg-secret' } });
  await page.click('Lịch sử');
  await page.waitFor(`document.querySelector('dialog[open]')`);
  await page.setBackground(true);
  assert.equal(await shielded(), true);
  assert.equal(await page.eval(`getComputedStyle(document.querySelector('dialog[open]')).visibility`), 'hidden');
  await page.shot('background-shield-360');
  await jump(59 * SEC);
  await page.setBackground(false);
  assert.equal(await page.eval(`!!document.querySelector('dialog[open]') && !!document.querySelector('[data-fk=lock]')`), true, 'still open');
  assert.equal(await page.eval(`document.body.hasAttribute('data-shield')`), false);
  await page.click('Đóng');
});

test('KM-004 AC06 60 s in the background: locked before anything shows, nothing of the vault in the DOM', async () => {
  await page.setBackground(true);
  // Timers do not run in a suspended app, so only coming back can notice.
  await page.eval(`(() => { const id = setTimeout(() => {}, 0); for (let i = 0; i <= id; i++) { clearInterval(i); clearTimeout(i); } })()`);
  await jump(61 * SEC);
  await page.setBackground(false);
  assert.equal(await page.has('Mở khoá'), true, 'locked by the time visibilitychange returned');
  assert.ok(!(await page.domDump()).includes(MARK));
  assert.equal(await page.eval(`document.body.hasAttribute('data-shield')`), false);
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  await unlock(page);
});

test('KM-004 AC07 the time can be changed on this device, holds after lock and reload, and takes effect', async () => {
  await page.click('Cài đặt');
  await page.waitText('Khoá sau khi chuyển nền');
  assert.equal(await page.value('Khoá sau khi chuyển nền'), '60000');
  assert.ok(!(await page.text()).includes('Tự khoá khi không thao tác'), 'only the rule for this device');
  await page.shot('settings-360');
  await page.select('Khoá sau khi chuyển nền', '15000');
  await page.waitText('Đã lưu');
  await page.click('Đóng');
  await page.click('Khoá');
  await unlock(page);
  await page.click('Cài đặt');
  assert.equal(await page.value('Khoá sau khi chuyển nền'), '15000');
  await page.click('Đóng');
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  await unlock(page);
  await page.setBackground(true);
  await jump(14 * SEC);
  await page.setBackground(false);
  assert.equal(await page.has('Mở khoá'), false, '14 s stays open');
  await page.setBackground(true);
  await jump(16 * SEC);
  await page.setBackground(false);
  assert.equal(await page.has('Mở khoá'), true, '16 s locks');
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  await unlock(page);
});
