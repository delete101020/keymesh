// KM-006 AC24–AC26 shown on screen, AC45, AC46: conflict marks from a real merge, and "Đã xử lý".
import test from 'node:test';
import assert from 'node:assert/strict';
import { trashItem, updateItem } from '../../src/public/js/core/model.js';
import { merge } from '../../src/public/js/core/merge.js';
import {
  PASSWORD,
  REGISTRATION_TOKEN,
  createItem,
  login,
  newUsername,
  nodeDevice,
  register,
  setup,
  startDevices,
  waitClean,
} from '../../testkit/sync-devices.mjs';

let env;
test.before(async () => {
  env = await startDevices({ names: [] });
});
test.after(() => env?.stop());

let n = 0;
const fresh = async () => (await env.add(`c${++n}`)).page;
const nudge = async (page) => {
  await page.setBackground(true);
  await page.setBackground(false);
};
const open = (page, title) => page.click(title, { exact: false, selector: '.list .row' });

async function pair(values = { Username: 'svc-user', Password: 'pw-base', URL: 'https://partner.example' }) {
  const A = await fresh();
  await setup(A);
  await createItem(A, { title: 'Partner X', values });
  const username = newUsername('cf');
  assert.equal(await register(A, { username, token: REGISTRATION_TOKEN, password: PASSWORD }), '');
  await waitClean(A);
  const B = await fresh();
  assert.equal(await login(B, { username, password: PASSWORD }), 'main');
  return { A, B, username };
}

async function editField(page, label, value) {
  await open(page, 'Partner X');
  await page.click('Sửa');
  await page.fill(`Giá trị ${label}`, value);
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('[data-fk=edit-title]')`);
}

// Both offline, each does `a` / `b`, then both online; returns once both are clean and the same.
async function offlineBoth({ A, B }, a, b) {
  await A.setOffline(true);
  await B.setOffline(true);
  await a(A);
  await b(B);
  await A.setOffline(false);
  await B.setOffline(false);
  await waitClean(A);
  await waitClean(B);
  await nudge(A);
  await waitClean(A);
}

const marks = (page) => page.eval(`({
  badge: !!document.querySelector('[data-fk=conflict-badge]'),
  rowBadge: document.querySelectorAll('.list .row .badge-conflict').length,
  fields: [...document.querySelectorAll('.field.conflicted .lbl')].map((x) => x.textContent.replace('⚠', '').replace('Xung đột', '').trim()),
  title: document.querySelector('h2[data-fk=detail-title]')?.classList.contains('conflicted') ?? false,
  note: document.querySelector('.conflict-note')?.innerText ?? '',
  count: document.querySelector('.nav-conflicts')?.textContent ?? '',
})`);

test('KM-006 AC24 FR35 FR36 FR38 same field on both: one copy, badge and mark on that field only, loser in history, secret still masked', async () => {
  const p = await pair();
  await offlineBoth(p, (A) => editField(A, 'Password', 'pw-from-A'), (B) => editField(B, 'Password', 'pw-from-B'));
  for (const page of [p.A, p.B]) {
    await open(page, 'Partner X');
    await page.waitFor(`!!document.querySelector('[data-fk=conflict-badge]')`, { timeout: 15000 });
    const m = await marks(page);
    assert.deepEqual([m.badge, m.rowBadge, m.fields, m.title], [true, 1, ['Password'], false]);
    assert.match(m.count, /1 item có xung đột/);
    const dom = await page.domDump();
    assert.ok(!dom.includes('pw-from-A') && !dom.includes('pw-from-B'), 'secret values stay masked');
  }
  await p.A.click('Có xung đột, xem lịch sử');
  await p.A.waitText('Xung đột');
  await p.A.click('Hiện giá trị Password');
  const history = await p.A.eval(`document.querySelector('dialog[open]').innerText`);
  assert.ok(/pw-from-A|pw-from-B/.test(history), 'the losing value is in the history');
  await p.A.key('Escape');
  env.ac46 = p;
});

test('KM-006 AC46 FR37 "Đã xử lý" on one device: the mark goes on both, content and history count unchanged; an edit alone keeps it', async () => {
  const { A, B } = env.ac46;
  await open(B, 'Partner X');
  await B.click('Sửa');
  await B.fill('Ghi chú', 'edited without resolving');
  await B.click('Lưu');
  await waitClean(B);
  assert.equal((await marks(B)).badge, true, 'editing does not clear the mark');
  await nudge(A);
  await open(A, 'Partner X');
  // B's edit adds a history entry of its own: count only once A has it.
  await A.waitText('edited without resolving', { timeout: 15000 });
  const historyBefore = await A.eval(`(async () => { document.querySelector('[data-fk=hist-item]').click(); await new Promise((r) => setTimeout(r, 100)); const n = document.querySelectorAll('dialog[open] .hist-entry').length; document.querySelector('dialog[open] .dlg-f button').click(); return n; })()`);
  await A.click('Đã xử lý');
  await A.waitFor(`!document.querySelector('[data-fk=conflict-badge]')`);
  await waitClean(A);
  await nudge(B);
  await B.waitFor(`!document.querySelector('[data-fk=conflict-badge]') && !document.querySelector('.list .row .badge-conflict')`, { timeout: 15000 });
  const historyAfter = await A.eval(`(async () => { document.querySelector('[data-fk=hist-item]').click(); await new Promise((r) => setTimeout(r, 100)); const n = document.querySelectorAll('dialog[open] .hist-entry').length; document.querySelector('dialog[open] .dlg-f button').click(); return n; })()`);
  assert.equal(historyAfter, historyBefore);
  await B.waitText('edited without resolving');
});

test('KM-006 AC25 FR19 different fields on both: both kept, no badge', async () => {
  const p = await pair();
  await offlineBoth(p, (A) => editField(A, 'Password', 'pw-A-only'), async (B) => {
    await open(B, 'Partner X');
    await B.click('Sửa');
    await B.fill('Ghi chú', 'note from B');
    await B.click('Lưu');
    await B.waitFor(`!document.querySelector('[data-fk=edit-title]')`);
  });
  for (const page of [p.A, p.B]) {
    await open(page, 'Partner X');
    await page.waitText('note from B');
    assert.equal((await marks(page)).badge, false);
    await page.click('Hiện Password');
    await page.waitText('pw-A-only');
  }
});

test('KM-006 AC45 FR36 FR38 marks on a field, a title, a deleted field and deletedAt: shown in place or in words; deleted-elsewhere line', async () => {
  const { A, username } = await pair();
  const node = await nodeDevice(env.server, username, PASSWORD);
  const { id, version, vault: base } = await node.read();
  const item = base.items[0];
  const byLabel = (v, label) => v.items[0].fields.find((f) => f.label === label);
  const at = (t, dev) => ({ now: Date.now() + t, deviceId: dev });
  // Local: change Username and the title, then trash the item. Remote: edit Password and the title, delete URL edited locally.
  const local = structuredClone(base);
  const remote = structuredClone(base);
  updateItem(local, item.id, { title: 'Partner X (A)', fields: local.items[0].fields.map((f) => ({ id: f.id, v: f.label === 'URL' ? 'https://edited.example' : f.v })) }, at(1, 'd_aaaaaaaaaaaaaaaa'));
  trashItem(local, item.id, at(2, 'd_aaaaaaaaaaaaaaaa'));
  updateItem(remote, item.id, { title: 'Partner X (B)', fields: remote.items[0].fields.filter((f) => f.label !== 'URL').map((f) => ({ id: f.id, v: f.label === 'Password' ? 'pw-remote' : f.v })) }, at(3, 'd_bbbbbbbbbbbbbbbb'));
  const merged = merge(base, local, remote);
  const c = merged.items[0].conflict;
  assert.ok(c && c.attrs.includes('deletedAt') && c.attrs.includes('title') && c.fields.includes(byLabel(base, 'URL').id), JSON.stringify(c));
  assert.equal((await node.write(id, merged, version)).status, 200);
  await nudge(A);
  await A.waitFor(`document.querySelectorAll('.list .row .badge-conflict').length === 1`, { timeout: 15000 });
  await open(A, 'Partner X (B)');
  const m = await marks(A);
  assert.equal(m.title, true);
  assert.deepEqual(m.fields, [], 'the conflicted field is gone from the screen');
  assert.match(m.note, /field đã xoá “URL”/);
  assert.match(m.note, /trạng thái xoá/);
  await A.click('Có xung đột, xem lịch sử');
  await A.waitText('đã bị xoá ở thiết bị khác');
  await A.key('Escape');
  // Phone: the count is on the home screen.
  await A.phone(390, 800);
  await A.reload();
  const { unlock } = await import('../../testkit/sync-devices.mjs');
  await unlock(A);
  await A.waitText('1 item có xung đột');
  await A.viewport(1280);
});
