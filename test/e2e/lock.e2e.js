import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, setup, unlock, addProject, PASSWORD } from '../../testkit/e2e/driver.mjs';

let app;
let page;
before(async () => {
  app = await startApp();
  page = await app.newPage();
  await page.waitText('Tạo tài khoản');
  await setup(page);
  await addProject(page, 'MARK-PROJECT-LOCK', 'dev');
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  assert.deepEqual(csp, [], 'AC45 no CSP violation in this file');
});

const MIN = 60000;
// Fake clock: Date.now jumps, nothing else changes, as after a sleep.
const jump = (ms) => page.eval(`(() => { const real = Date.now.bind(Date); const base = window.__skew ?? 0; window.__skew = base + ${ms}; if (!window.__patched) { window.__patched = true; Date.now = () => real() + window.__skew; } })()`);

test('KM-003 AC08 FR10 FR12 Khoá: lock screen at once, nothing of the vault left in the DOM', async () => {
  await page.waitText('MARK-PROJECT-LOCK');
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  assert.ok(!(await page.domDump()).includes('MARK-PROJECT-LOCK'));
  await unlock(page);
  await page.waitText('MARK-PROJECT-LOCK');
});

test('KM-003 FR09 reload always comes back to the lock screen', async () => {
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  await unlock(page);
});

test('KM-003 AC09 FR11 ten idle minutes lock within seconds; activity at minute 9 restarts the count', async () => {
  await jump(9 * MIN);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200, y: 300 });
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(await page.has('Khoá'), true);
  await jump(9 * MIN);
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(await page.has('Khoá'), true, 'minute 9 reset the count');
  await jump(1 * MIN);
  await page.waitFor(page.find('Mở khoá'), { timeout: 3000 });
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  await unlock(page);
});

test('KM-003 AC10 FR11 waking after 11 minutes: the first event locks before it does anything', async () => {
  // Stop the interval so only an event can notice, as when timers did not run during sleep.
  await page.eval(`(() => { const id = setTimeout(() => {}, 0); for (let i = 0; i <= id; i++) { clearInterval(i); clearTimeout(i); } })()`);
  await jump(11 * MIN);
  await page.waitText('MARK-PROJECT-LOCK', { timeout: 500 });
  await page.key('Tab');
  await page.waitFor(page.find('Mở khoá'), { timeout: 1000 });
  assert.ok(!(await page.domDump()).includes('MARK-PROJECT-LOCK'));
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
});

test('KM-003 AC11 FR13 a second tab cannot unlock and says why; after the first closes it can, with the latest data', async () => {
  await unlock(page);
  const b = await app.newPage();
  await b.waitFor(b.find('Mở khoá'));
  await b.fill('Master password', PASSWORD);
  await b.click('Mở khoá');
  await b.waitText('đang mở khoá ở một tab khác');
  assert.equal(await b.has('Khoá'), false);
  await addProject(page, 'LATEST-FROM-A', 'dev');
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  await unlock(b);
  await b.waitText('LATEST-FROM-A');
  await page.fill('Master password', PASSWORD);
  await page.click('Mở khoá');
  await page.waitText('đang mở khoá ở một tab khác');
  await app.closePage(b);
  await unlock(page);
  await page.waitText('LATEST-FROM-A');
});
