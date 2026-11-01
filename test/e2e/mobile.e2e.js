// The app on a touch device at 360×640: background lock, settings, then navigation and the home screen.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, setup, unlock, createItem, addProject, PASSWORD, READ_DB } from '../../testkit/e2e/driver.mjs';

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

// --- navigation ---------------------------------------------------------------------------------

const pane = () => page.eval(`document.querySelector('.cols').dataset.pane`);
const entries = () => page.eval(`history.length`);
// A real history step, as Android's Back makes one. Waits for the app to have dealt with it.
const back = async () => {
  await page.eval(`new Promise((resolve) => { addEventListener('popstate', () => setTimeout(resolve, 30), { once: true }); history.back(); })`);
  await new Promise((r) => setTimeout(r, 60));
};
const swipe = async (x0, x1, y = 300) => {
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (x0 + x1) / 2, y }] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1, y }] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 80));
};

test('KM-004 AC08 Back steps through the panes; the URL never changes', async () => {
  const url = await page.eval(`location.href`);
  assert.equal(await pane(), 'nav');
  await page.click('Tất cả', { exact: false });
  assert.equal(await pane(), 'list');
  await page.click(MARK);
  assert.equal(await pane(), 'detail');
  assert.equal(await page.eval(`history.state.km`), 2);
  await back();
  assert.equal(await pane(), 'list');
  await back();
  assert.equal(await pane(), 'nav');
  assert.equal(await page.eval(`location.href`), url);
  assert.equal(await page.eval(`history.state.km`), 0);
});

test('KM-004 AC08 the on-screen back button and history stay in step', async () => {
  await page.click('Tất cả', { exact: false });
  await page.click(MARK);
  await page.click('Quay lại');
  assert.equal(await pane(), 'list', 'changes at once');
  await page.waitFor(`history.state.km === 1`);
  await page.click('Quay lại');
  await page.waitFor(`history.state.km === 0`);
  assert.equal(await pane(), 'nav');
});

test('KM-004 AC08 Back with an open dialog closes only the dialog', async () => {
  await page.click('Tất cả', { exact: false });
  await page.click(MARK);
  await page.click('Lịch sử');
  await page.waitFor(`document.querySelector('dialog[open]')`);
  await back();
  assert.equal(await page.eval(`!!document.querySelector('dialog[open]')`), false);
  assert.equal(await pane(), 'detail');
  assert.equal(await page.eval(`history.state.km`), 2, 'history unchanged');
});

test('KM-004 AC08 Back with unsaved edits asks; keeping them stays on the form with history intact', async () => {
  await page.click('Sửa');
  await page.fill('Tiêu đề', `${MARK} edited`);
  await back();
  await page.waitText('Bỏ bản nháp?');
  await page.click('Huỷ');
  assert.equal(await page.value('Tiêu đề'), `${MARK} edited`);
  assert.equal(await pane(), 'detail');
  assert.equal(await page.eval(`history.state.km`), 2);
  await back();
  await page.click('Bỏ bản nháp');
  await page.waitFor(`document.querySelector('.cols').dataset.pane === 'list'`);
  await page.waitFor(`history.state.km === 1`);
  await page.click('Quay lại');
  await page.waitFor(`history.state.km === 0`);
});

test('KM-004 AC08 swiping from the left edge goes back; a swipe from the middle does not', async () => {
  await page.click('Tất cả', { exact: false });
  await page.click(MARK);
  assert.equal(await pane(), 'detail');
  await swipe(150, 300);
  assert.equal(await pane(), 'detail');
  await swipe(5, 150);
  assert.equal(await pane(), 'list');
  await swipe(5, 150);
  assert.equal(await pane(), 'nav');
  await page.waitFor(`history.state.km === 0`);
});

test('KM-004 AC08 on iOS the system owns the edge swipe: the app does not go back as well, and the Back it sends still works', async () => {
  await page.click('Tất cả', { exact: false });
  await page.click(MARK);
  assert.equal(await pane(), 'detail');
  await page.eval(`Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })`);
  await swipe(5, 150);
  assert.equal(await pane(), 'detail');
  await page.eval(`history.back()`);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(await pane(), 'list');
  await page.eval(`delete navigator.standalone`);
  await swipe(5, 150);
  assert.equal(await pane(), 'nav');
  await page.waitFor(`history.state.km === 0`);
});

test('KM-004 AC08 after locking, Back shows nothing of the vault', async () => {
  await page.click('Tất cả', { exact: false });
  await page.click(MARK);
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  await page.waitFor(`history.state.km === 0`);
  await page.eval(`history.forward()`);
  await new Promise((r) => setTimeout(r, 100));
  await page.eval(`history.back()`);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(await page.has('Mở khoá'), true);
  assert.ok(!(await page.domDump()).includes(MARK));
  await unlock(page);
  assert.equal(await pane(), 'nav');
});

test('KM-004 AC08 a reload deep in the panes comes back to the bottom of history', async () => {
  await page.click('Tất cả', { exact: false });
  await page.click(MARK);
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  await page.waitFor(`history.state.km === 0`);
  await unlock(page);
});

// --- home screen --------------------------------------------------------------------------------

const realTaps = () => {
  // Counts what reaches the page as a press, so a tap that does nothing would still show.
  return page.eval(`(() => { window.__taps = 0; addEventListener('pointerdown', () => { window.__taps++; }, { capture: true }); })()`);
};
const inViewport = (name) => page.eval(`(() => { const r = ${page.find(name)}.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; })()`);
const tapWithoutScrolling = async (name) => {
  assert.equal(await inViewport(name), true, `${name} is on screen without scrolling`);
  const { x, y } = await page.eval(`(() => { const r = ${page.find(name)}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 40));
};
const homeTitles = (title) => page.eval(`[...document.querySelectorAll('.home-sec')].filter((s) => s.querySelector('.nav-sec').textContent === ${JSON.stringify(title)}).flatMap((s) => [...s.querySelectorAll('.ttl')].map((x) => x.textContent))`);

test('KM-004 AC08 AC12 unlock, tap a recent item, tap copy: three taps at 360×640, with the value on the clipboard', async () => {
  await app.grantClipboard();
  await page.click('Tất cả', { exact: false });
  await createItem(page, { title: 'Recent one', values: { Username: 'me', Password: 'three-taps-secret' } });
  await page.click('Quay lại');
  await page.waitFor(`document.querySelector('.cols').dataset.pane === 'list'`);
  await page.click('Recent one'); // Saving is not using it; opening is.
  await page.click('Quay lại');
  await page.waitFor(`document.querySelector('.cols').dataset.pane === 'list'`);
  await page.click('Quay lại');
  await page.waitFor(`document.querySelector('.cols').dataset.pane === 'nav'`);
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  await page.fill('Master password', PASSWORD);
  await realTaps();
  await tapWithoutScrolling('Mở khoá');
  await page.waitFor(page.find('Khoá'));
  assert.deepEqual((await homeTitles('Gần đây'))[0], 'Recent one', 'the item opened last leads Gần đây');
  await page.shot('home-360');
  await tapWithoutScrolling('Recent one');
  await page.waitFor(page.find('Copy Password'));
  await page.shot('detail-phone-360');
  await tapWithoutScrolling('Copy Password');
  await page.waitText('Sẽ xoá khỏi clipboard');
  assert.equal(await page.eval(`navigator.clipboard.readText()`), 'three-taps-secret');
  assert.equal(await page.eval(`window.__taps`), 3);
});

test('KM-004 AC12 Back from an item opened on the home screen returns straight home', async () => {
  await back();
  assert.equal(await pane(), 'nav');
  await page.waitFor(`history.state.km === 0`);
});

test('KM-004 AC12 recents hold only ids on disk, at most 5, and an id with no item shows nothing', async () => {
  const stored = await page.eval(`new Promise((resolve) => {
    const open = indexedDB.open('keymesh');
    open.onsuccess = () => { const g = open.result.transaction('meta').objectStore('meta').get('settings'); g.onsuccess = () => { open.result.close(); resolve(g.result); }; };
  })`);
  assert.ok(!JSON.stringify(stored).includes('Recent one'));
  assert.ok(stored.recents.every((id) => /^[a-z0-9_]+$/i.test(id)), JSON.stringify(stored.recents));
  await page.eval(`new Promise((resolve) => {
    const open = indexedDB.open('keymesh');
    open.onsuccess = () => {
      const tx = open.result.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ ...${JSON.stringify(stored)}, recents: ['gone-1', ...${JSON.stringify(stored.recents)}] }, 'settings');
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  })`);
  await page.click('Khoá');
  await unlock(page);
  assert.equal((await homeTitles('Gần đây'))[0], 'Recent one', 'the stale id is skipped');
  for (const i of [1, 2, 3, 4, 5]) {
    await page.click('Tất cả', { exact: false });
    await createItem(page, { title: `Filler ${i}` });
    await page.click('Quay lại');
    await page.click('Quay lại');
    await page.waitFor(`document.querySelector('.cols').dataset.pane === 'nav'`);
  }
  await page.click('Tất cả', { exact: false });
  for (const i of [1, 2, 3, 4, 5]) {
    await page.click(`Filler ${i}`);
    await page.click('Quay lại');
    await page.waitFor(`document.querySelector('.cols').dataset.pane === 'list'`);
  }
  await page.click('Quay lại');
  await page.waitFor(`document.querySelector('.cols').dataset.pane === 'nav'`);
  assert.deepEqual(await homeTitles('Gần đây'), ['Filler 5', 'Filler 4', 'Filler 3', 'Filler 2', 'Filler 1']);
});

test('KM-004 AC12 a star puts the item under Yêu thích and survives locking', async () => {
  assert.deepEqual(await homeTitles('Yêu thích'), []);
  await page.click('Filler 3');
  await page.click('Yêu thích');
  await page.waitFor(page.find('Bỏ yêu thích'));
  await page.click('Quay lại');
  await page.waitFor(`document.querySelector('.cols').dataset.pane === 'nav'`);
  assert.deepEqual(await homeTitles('Yêu thích'), ['Filler 3']);
  await page.click('Khoá');
  await unlock(page);
  assert.deepEqual(await homeTitles('Yêu thích'), ['Filler 3']);
});

test('KM-004 AC08 a project opens its envs as tabs, which move between them in one tap', async () => {
  await addProject(page, 'Payment GW', 'uat, staging');
  await page.click('Tất cả', { exact: false });
  await page.click('Filler 1');
  await page.click('Sửa');
  await page.click('Payment GW / uat');
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('form.stack')`);
  await page.click('Quay lại');
  await page.click('Quay lại');
  await page.waitFor(`document.querySelector('.cols').dataset.pane === 'nav'`);
  assert.equal(await page.eval(`[...document.querySelectorAll('.nav-item.env')].every((e) => e.getBoundingClientRect().width === 0)`), true, 'envs are not rows here');
  await page.click('Payment GW', { exact: false });
  assert.equal(await pane(), 'list');
  await page.click('uat');
  await page.waitText('Payment GW › uat');
  assert.equal(await page.eval(`document.querySelectorAll('.list .row').length`), 1);
  await page.shot('env-tabs-360');
  await page.click('staging');
  await page.waitText('Payment GW › staging');
  assert.equal(await page.eval(`document.querySelectorAll('.list .row').length`), 0);
  assert.equal(await page.eval(`history.state.km`), 1, 'moving between tabs adds no Back steps');
  await page.click('Quay lại');
  await page.waitFor(`document.querySelector('.cols').dataset.pane === 'nav'`);
});

test('KM-004 AC08 secret fields do not autocorrect; 16 px boxes so iOS does not zoom; every target 44 px, no sideways scroll', async () => {
  const targets = `[...(document.querySelector('dialog[open]') ?? document).querySelectorAll('button,a.icon-link')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map((el) => (el.getAttribute('aria-label') || el.innerText))`;
  const sideways = `document.documentElement.scrollWidth > document.documentElement.clientWidth`;
  const check = async (where) => {
    assert.deepEqual(await page.eval(targets), [], where);
    assert.equal(await page.eval(sideways), false, where);
  };
  await check('home');
  await page.click('Tất cả', { exact: false });
  await check('list');
  await page.click('Thêm item');
  await page.click('Login');
  await check('form');
  await page.select('Kiểu field mới', 'secret-multi');
  await page.click('Thêm field');
  const attrs = await page.eval(`[...document.querySelectorAll('[aria-label^="Giá trị"]')].map((el) => [el.getAttribute('autocomplete'), el.getAttribute('autocapitalize'), el.getAttribute('spellcheck')].join())`);
  assert.ok(attrs.length >= 3);
  for (const a of attrs) assert.equal(a, 'off,off,false');
  const sizes = await page.eval(`[...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => parseFloat(getComputedStyle(e).fontSize))`);
  assert.ok(sizes.length > 3 && sizes.every((s) => s >= 16), sizes.join());
  await page.click('Huỷ');
  await page.waitFor(`!document.querySelector('form.stack') && !document.querySelector('.cat-grid') || !!document.querySelector('dialog[open]')`);
  if (await page.eval(`!!document.querySelector('dialog[open]')`)) await page.click('Bỏ bản nháp');
  if ((await pane()) === 'detail') await page.click('Quay lại');
  if ((await pane()) === 'list') await page.click('Quay lại');
  await page.waitFor(`history.state.km === 0`);
});

test('KM-004 AC12 at 1280 px on a computer: no Gần đây, no Yêu thích, no star, no tabs, and one column set as before', async () => {
  const wide = await app.newPage();
  await wide.waitFor(wide.find('Mở khoá'));
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  await unlock(wide);
  await wide.click('Payment GW', { exact: false });
  await wide.click('Filler 1');
  await wide.waitFor(wide.find('Lịch sử'));
  const text = await wide.text();
  assert.doesNotMatch(text, /Gần đây|Yêu thích/);
  assert.equal(await wide.has('Yêu thích'), false);
  assert.equal(await wide.eval(`getComputedStyle(document.querySelector('.cols')).gridTemplateColumns.split(' ').length`), 3);
  assert.equal(await wide.eval(`[...document.querySelectorAll('.env-tabs')].every((e) => e.getBoundingClientRect().width === 0)`), true);
  assert.equal(await wide.eval(`document.querySelector('.dh').contains(${wide.find('Lịch sử')})`), true, 'buttons stay in the title row');
  assert.equal(await wide.eval(`matchMedia('(hover: none) and (pointer: coarse)').matches`), false);
  await wide.shot('detail-1280');
  await wide.click('Khoá');
  await app.closePage(wide);
});
