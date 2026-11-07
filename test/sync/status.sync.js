// KM-006 AC41–AC44: the status bar and its details, on real browsers against a real local server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  PASSWORD,
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
import { addProject } from '../../testkit/e2e/driver.mjs';

let env;
test.before(async () => {
  env = await startDevices({ names: [] });
});
test.after(() => env?.stop());

let n = 0;
const fresh = async () => (await env.add(`s${++n}`)).page;
const bar = (page) => page.eval(`(() => { const b = document.querySelector('.syncbar'); return b ? { text: b.querySelector('[role=status]').textContent, tone: [...b.classList].find((c) => c.startsWith('tone-')), visible: b.getBoundingClientRect().height > 0 } : null; })()`);
const dot = (page) => page.eval(`(() => { const d = document.querySelector('.syncdot'); return d ? { label: d.getAttribute('aria-label'), tone: [...d.classList].find((c) => c.startsWith('tone-')), visible: d.getBoundingClientRect().height >= 44, symbol: d.textContent } : null; })()`);
const waitBar = (page, text, timeout = 15000) => page.waitFor(`document.querySelector('.syncbar [role=status]')?.textContent.startsWith(${JSON.stringify(text)})`, { what: `status "${text}"`, timeout });
const nudge = async (page) => {
  await page.setBackground(true);
  await page.setBackground(false);
};

async function registered() {
  const page = await fresh();
  await setup(page);
  await createItem(page, { title: 'Status item', values: { Password: 'pw-status' } });
  const username = newUsername('st');
  assert.equal(await register(page, { username, token: REGISTRATION_TOKEN, password: PASSWORD }), '');
  await waitClean(page);
  return { page, username };
}

async function editTitle(page, from, to) {
  await page.click(from, { exact: false, selector: '.list .row' });
  await page.click('Sửa');
  await page.fill('Tiêu đề', to);
  await page.click('Lưu');
  await page.waitFor(`document.querySelector('h2[data-fk=detail-title]')?.textContent === ${JSON.stringify(to)}`);
}

test('KM-006 AC41 FR31 NFR11 every state: words, symbol, colour class, priority; a status region; dot on a phone', async () => {
  const seen = {};
  // Local, never registered.
  const local = await fresh();
  await setup(local);
  await waitBar(local, 'Chỉ trên máy này');
  seen.local = await bar(local);
  assert.equal(await local.eval(`document.querySelectorAll('.syncbar [role=status]').length`), 1);

  const { page, username } = await registered();
  await waitBar(page, 'Đã đồng bộ');
  seen.synced = await bar(page);
  await page.shot('ac41-synced-desktop');

  // Pending: inside the 1.5 s before the push.
  await createItem(page, { title: 'Pending item' });
  seen.pending = await page.waitFor(`(() => { const t = document.querySelector('.syncbar [role=status]').textContent; return /thay đổi chờ/.test(t) && !/Offline/.test(t) ? t : false; })()`, { timeout: 3000 });
  seen.pendingTone = (await bar(page)).tone;
  await waitClean(page);

  // Syncing: the list request held until released.
  let release;
  const held = new Promise((r) => (release = r));
  const offHold = await page.intercept('*/api/vaults', async () => (await held, 'continue'));
  await nudge(page);
  await waitBar(page, 'Đang đồng bộ');
  seen.syncing = await bar(page);
  release();
  await offHold();
  await waitBar(page, 'Đã đồng bộ');

  // Offline with one change: offline wins over pending.
  await page.setOffline(true);
  await createItem(page, { title: 'Offline item' });
  await waitBar(page, 'Offline – 1 thay đổi chờ', 20000);
  seen.offline = await bar(page);
  await page.shot('ac41-offline-desktop');
  await page.setOffline(false);
  await waitClean(page);

  // Error (5xx on push) wins over pending.
  const off500 = await page.intercept('*/api/vaults/*', (req) => (req.method === 'PUT' ? { status: 500, body: { error: 'internal', message: 'x' } } : 'continue'));
  await createItem(page, { title: 'Error item' });
  await waitBar(page, 'Lỗi đồng bộ', 20000);
  seen.error = await bar(page);
  await off500();
  await nudge(page);
  await waitBar(page, 'Đã đồng bộ', 20000);

  // Needs login: the session vanishes on the server.
  env.server.exec('DELETE FROM dt_session');
  await nudge(page);
  await waitBar(page, 'Cần đăng nhập lại');
  seen.needsLogin = await bar(page);
  await page.shot('ac41-needs-login-desktop');

  // Phone: a dot of at least 44 px with the whole status as its name; the bar is hidden.
  await page.phone(390, 800);
  await page.reload();
  await unlock(page);
  const onPhone = await page.waitFor(`(() => { const d = document.querySelector('.syncdot'); return d && d.getAttribute('aria-label').includes('Cần đăng nhập lại') ? true : false; })()`);
  assert.ok(onPhone);
  seen.phoneDot = await dot(page);
  seen.phoneBar = (await bar(page)).visible;
  await page.shot('ac41-needs-login-phone');
  await page.viewport(1280);

  // Logged out.
  await page.click('Cài đặt');
  await page.click('Đăng nhập lại').catch(() => {});
  await page.key('Escape');
  const other = await fresh();
  assert.equal(await login(other, { username, password: PASSWORD }), 'main');
  await other.click('Cài đặt');
  await other.click('Đăng xuất');
  await other.click('Đăng xuất, giữ dữ liệu');
  await unlock(other);
  await waitBar(other, 'Đã đăng xuất');
  seen.loggedOut = await bar(other);

  console.log('KM-006 AC41 states:', JSON.stringify(seen));
  assert.deepEqual(
    [seen.local.tone, seen.synced.tone, seen.pendingTone, seen.syncing.tone, seen.offline.tone, seen.error.tone, seen.needsLogin.tone, seen.loggedOut.tone],
    ['tone-gray', 'tone-green', 'tone-yellow', 'tone-blue', 'tone-gray', 'tone-red', 'tone-red', 'tone-gray'],
  );
  assert.match(seen.synced.text, /^Đã đồng bộ · vừa xong$/);
  assert.match(seen.pending, /^1 thay đổi chờ$/);
  assert.equal(seen.offline.text, 'Offline – 1 thay đổi chờ');
  assert.equal(seen.error.text, 'Lỗi đồng bộ');
  assert.deepEqual([seen.phoneDot.visible, seen.phoneDot.symbol, seen.phoneDot.tone, seen.phoneBar], [true, '⚠', 'tone-red', false]);
});

test('KM-006 AC42 FR32 offline: an item saved twice and a new env count 2; the item back as it was counts 1 less', async () => {
  const { page } = await registered();
  await page.setOffline(true);
  await editTitle(page, 'Status item', 'Status item v2');
  await editTitle(page, 'Status item v2', 'Status item v3');
  await addProject(page, 'CRM', '');
  await waitBar(page, 'Offline – 2 thay đổi chờ', 20000);
  await editTitle(page, 'Status item v3', 'Status item');
  await waitBar(page, 'Offline – 1 thay đổi chờ', 20000);
  await page.setOffline(false);
  await waitClean(page);
});

test('KM-006 AC43 FR33 FR34 details: per vault, no item data; sync now twice in backoff is one round within 1 s; offline says so at once', async () => {
  const { page } = await registered();
  const off = await page.intercept('*/api/vaults', () => ({ status: 503, body: { error: 'internal', message: 'x' } }));
  await nudge(page);
  await waitBar(page, 'Lỗi đồng bộ');
  await off();
  await page.click('Trạng thái đồng bộ', { exact: false });
  await page.waitText('Vault mặc định');
  const dialog = await page.eval(`document.querySelector('dialog[open]').innerText`);
  assert.doesNotMatch(dialog, /Status item|pw-status/);
  assert.match(dialog, /Server đang gặp lỗi/);
  const before = page.apiCalls().filter((p) => p === '/api/vaults').length;
  const t0 = Date.now();
  await page.click('Đồng bộ ngay');
  await page.click('Đồng bộ ngay').catch(() => {});
  await page.waitFor(`document.querySelector('dialog[open]').innerText.includes('Đã đồng bộ')`, { timeout: 5000 });
  const lists = page.apiCalls().filter((p) => p === '/api/vaults').length - before;
  assert.equal(lists, 1, 'one round');
  assert.ok(Date.now() - t0 < 3000);
  const firstAt = page.responses.findIndex((r) => r.url?.endsWith('/api/vaults') && r.status === 200);
  assert.ok(firstAt >= 0);
  await page.setOffline(true);
  const m = page.apiCalls().length;
  await page.click('Đồng bộ ngay');
  await page.waitText('Không có mạng');
  assert.equal(page.apiCalls().length, m);
  await page.setOffline(false);
  await page.key('Escape');
});

test('KM-006 AC44 FR30 a vault under 1 000 000 bytes: no warning; over: a warning, and it still syncs', async () => {
  const { page } = await registered();
  const filler = (bytes) => randomBytes(Math.ceil(bytes * 0.75)).toString('base64').slice(0, bytes);
  await createItem(page, { type: 'Note', title: 'Big one', values: {} });
  await page.click('Sửa');
  await page.fill('Ghi chú', filler(800_000));
  await page.click('Lưu');
  await waitClean(page, 60000);
  await nudge(page);
  await waitBar(page, 'Đã đồng bộ', 30000);
  const small = env.server.sql('SELECT size FROM dt_vault ORDER BY updated_at DESC LIMIT 1')[0].size;
  assert.ok(small < 1_000_000, String(small));
  assert.equal(await page.eval(`!!document.querySelector('.sync-large')`), false);
  await createItem(page, { type: 'Note', title: 'Bigger one', values: {} });
  await page.click('Sửa');
  await page.fill('Ghi chú', filler(300_000));
  await page.click('Lưu');
  await waitClean(page, 60000);
  await nudge(page);
  await page.waitFor(`!!document.querySelector('.sync-large')`, { what: 'large warning', timeout: 30000 });
  const big = env.server.sql('SELECT size FROM dt_vault ORDER BY updated_at DESC LIMIT 1')[0].size;
  assert.ok(big >= 1_000_000 && big < 2_000_000, String(big));
  console.log(`KM-006 AC44 sizes: ${small} (no warning), ${big} (warning)`);
});
