import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, setup, unlock, addProject } from '../../testkit/e2e/driver.mjs';

let app;
let page;
before(async () => {
  app = await startApp();
  page = await app.newPage();
  await page.waitText('Tạo tài khoản');
  await setup(page);
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  assert.deepEqual(csp, [], 'AC45 no CSP violation in this file');
});

const navOrder = () => page.eval(`[...document.querySelectorAll('.side .nav-item')].map((b) => b.querySelector('.name').textContent)`);
const closeDialog = async () => {
  await page.click('Xong');
  await page.waitFor(`!document.querySelector('dialog[open]')`);
};

test('KM-003 AC40 empty vault has an empty state with the next step', async () => {
  await page.waitText('Vault chưa có item nào');
});

test('KM-003 AC12 FR14 FR16 default env list in order; empty and duplicate names are refused', async () => {
  await addProject(page, 'Payment GW');
  assert.deepEqual((await navOrder()).slice(3), ['Payment GW', 'dev', 'uat', 'staging', 'prod']);
  await page.click('Thêm project');
  await page.click('Tạo project');
  await page.waitText('Tên không được trống');
  await page.fill('Tên project', 'payment gw');
  await page.click('Tạo project');
  await page.waitText('Tên này đã có');
  await page.fill('Tên project', 'CRM');
  await page.fill('Các env', 'uat');
  await page.click('Tạo project');
  await page.waitFor(`!document.querySelector('dialog[open]')`);
  await page.click('Quản lý project CRM');
  await page.fill('Tên env mới', 'UAT');
  await page.click('Thêm env');
  await page.waitText('Tên này đã có');
  await page.fill('Tên env mới', 'qa');
  await page.click('Thêm env');
  await page.waitFor(page.find('Tên env qa'));
  await page.fill('Tên env qa', 'qa2');
  await page.click('Lưu tên env qa');
  await page.waitFor(page.find('Tên env qa2'));
  await page.click('Xoá env qa2');
  await page.waitText('0 item đang gán');
  await page.click('Xoá env');
  await page.waitFor(`!${page.find('Tên env qa2')}`);
  await closeDialog();
});

test('KM-003 AC14 FR17 reorder by keyboard only; order survives lock and unlock', async () => {
  await page.eval(`${page.find('Quản lý project CRM')}.focus()`);
  await page.key('Enter', { text: '\r' });
  await page.waitFor(page.find('Đưa project lên'));
  await page.tabTo('Đưa project lên');
  await page.key('Enter', { text: '\r' });
  await page.waitFor(`document.activeElement === ${page.find('Đưa project lên')} || document.activeElement.tagName !== 'BODY'`);
  await closeDialog();
  await page.click('Quản lý project Payment GW');
  await page.tabTo('Đưa env prod lên');
  await page.key(' ', { code: 'Space', text: ' ' });
  await page.waitFor(`!!${page.find('Đưa env prod xuống')} && !${page.find('Đưa env prod xuống')}.disabled`);
  await closeDialog();
  const expected = ['CRM', 'uat', 'Payment GW', 'dev', 'uat', 'prod', 'staging'];
  assert.deepEqual((await navOrder()).slice(3), expected);
  await page.click('Khoá');
  await unlock(page);
  assert.deepEqual((await navOrder()).slice(3), expected);
});

test('KM-003 AC15 FR18 an env colour shows in both themes without CSP trouble', async () => {
  await page.click('Quản lý project Payment GW');
  await page.select('Màu env prod', 'red');
  await page.waitFor(`document.querySelector('.env-dot.env-red')`);
  await closeDialog();
  const color = () => page.eval(`getComputedStyle(document.querySelector('.env-dot.env-red')).backgroundColor`);
  await page.colorScheme('light');
  assert.equal(await color(), 'rgb(201, 58, 58)');
  await page.colorScheme('dark');
  assert.equal(await color(), 'rgb(239, 107, 107)');
  await page.colorScheme('light');
});

test('KM-003 AC13 FR15 project delete asks with a count and cleans the navigation', async () => {
  await addProject(page, 'Doomed', 'a, b');
  await page.click('Quản lý project Doomed');
  await page.click('Xoá project');
  await page.waitText('0 item đang gán');
  await page.click('Huỷ');
  await page.click('Xoá project');
  await page.waitText('0 item đang gán');
  await page.click('Xoá project');
  await page.waitFor(`!document.querySelector('dialog[open]')`);
  assert.ok(!(await navOrder()).includes('Doomed'));
});

test('KM-003 FR46 narrow screen: nav, then list; back returns', async () => {
  await page.viewport(360);
  await page.click('Tất cả, 0 item');
  await page.waitFor(page.find('Thêm item'));
  assert.equal(await page.eval(`getComputedStyle(document.querySelector('.side')).display`), 'none');
  await page.click('Quay lại');
  await page.waitFor(page.find('Thêm project'));
  assert.equal(await page.eval(`getComputedStyle(document.querySelector('.list')).display`), 'none');
  await page.shot('nav-360');
  await page.viewport(1280);
});
