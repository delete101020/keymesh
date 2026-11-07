// KM-006 AC21–AC30: changes travelling between two real browsers through a real local server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READ_DB_ALL,
  createItem,
  editItem,
  nodeDevice,
  nudge,
  openItem,
  pageFetch,
  pairOn,
  responsesSince,
  startDevices,
  unlock,
  until,
  waitClean,
  PASSWORD,
} from '../../testkit/sync-devices.mjs';

let env;
test.before(async () => {
  env = await startDevices();
});
test.after(() => env?.stop());

const db = (page) => page.eval(READ_DB_ALL);
const PROJECTS = { name: 'PaymentGW', envs: 'uat, staging, prod' };

test('KM-006 FR40 harness: two profiles reach one server on the app origin, and one goes offline alone', async () => {
  const { A, B } = env;
  for (const d of [A, B]) {
    assert.equal(await d.page.eval('isSecureContext'), true);
    assert.equal((await pageFetch(d.page, '/api/vaults')).status, 401);
    // POST carries Origin: passing the gate shows the app origin is allowed.
    assert.match((await pageFetch(d.page, '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).body, /registration_closed/);
  }
  await A.page.setOffline(true);
  assert.equal(await A.page.eval('navigator.onLine'), false);
  assert.deepEqual(await pageFetch(A.page, '/api/vaults'), { status: 0, error: 'TypeError' });
  assert.equal((await pageFetch(B.page, '/api/vaults')).status, 401);
  await A.page.setOffline(false);
  assert.equal((await pageFetch(A.page, '/api/vaults')).status, 401);
  assert.ok(A.page.responses.some((r) => r.url?.endsWith('/api/vaults') && r.status === 401));
});

test('KM-006 AC21 FR16 NFR05 criterion 1: saved right after the other device polled, it shows there in ≤ 60 s, in both envs', async () => {
  const { A, B } = await pairOn(env, { title: null, project: PROJECTS });
  await B.waitText('uat', { timeout: 15000 });
  // Wait for one of B's polls, then save on A at once: the worst case for B.
  const from = B.responses.length;
  await until(() => responsesSince(B, from, (r) => r.url.endsWith('/api/vaults')).length > 0, { timeout: 60000, what: 'a poll of B' });
  const t0 = Date.now();
  await createItem(A, { title: 'Partner X', values: { Password: 'pw-ac21' }, envs: ['PaymentGW / uat', 'PaymentGW / staging'] });
  await B.waitText('Partner X', { timeout: 65000 });
  const seconds = (Date.now() - t0) / 1000;
  console.log(`KM-006 AC21 save on A to shown on B: ${seconds.toFixed(1)} s`);
  assert.ok(seconds <= 60, String(seconds));
  await openItem(B, 'Partner X');
  await B.waitText('PaymentGW / uat');
  await B.waitText('PaymentGW / staging');
});

test('KM-006 AC22 FR15 NFR05 B locked, then in the background: no request meanwhile; back in ≤ 10 s', async () => {
  const { A, B } = await pairOn(env);
  await B.click('Khoá');
  let from = B.requests.length;
  await createItem(A, { title: 'While B locked' });
  await waitClean(A);
  await new Promise((r) => setTimeout(r, 55000)); // longer than one poll
  assert.equal(B.requests.slice(from).filter((u) => u.includes('/api/')).length, 0, 'locked: 0 requests');
  let t0 = Date.now();
  await unlock(B);
  await B.waitText('While B locked', { timeout: 10000 });
  console.log(`KM-006 AC22 after unlock: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await B.setBackground(true);
  from = B.requests.length;
  await createItem(A, { title: 'While B hidden' });
  await waitClean(A);
  await new Promise((r) => setTimeout(r, 55000));
  assert.equal(B.requests.slice(from).filter((u) => u.includes('/api/')).length, 0, 'hidden: 0 requests');
  t0 = Date.now();
  await B.setBackground(false);
  await B.waitText('While B hidden', { timeout: 10000 });
  console.log(`KM-006 AC22 after foreground: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
});

test('KM-006 AC23 FR18 FR20 criterion 2: B offline changes a password, comes online, A gets it, history keeps the old one', async () => {
  const { A, B } = await pairOn(env);
  await B.setOffline(true);
  await editItem(B, 'Partner X', { fields: { Password: 'pw-new-ac23' } });
  await B.waitFor(`document.querySelector('.syncbar [role=status]').textContent.startsWith('Offline – 1 thay đổi chờ')`, { timeout: 20000 });
  await B.setOffline(false);
  await waitClean(B, 10000);
  await B.waitFor(`document.querySelector('.syncbar [role=status]').textContent.startsWith('Đã đồng bộ')`);
  await nudge(A);
  await openItem(A, 'Partner X');
  await A.click('Hiện Password');
  await A.waitText('pw-new-ac23', { timeout: 15000 });
  await A.click('Lịch sử');
  await A.click('Hiện giá trị Password');
  await A.waitText('pw-base');
  await A.key('Escape');
});

test('KM-006 AC24 NFR06 criterion 3: the same field on both converges in ≤ 2 pushes, same content on both', async () => {
  const { A, B, username } = await pairOn(env);
  await A.setOffline(true);
  await B.setOffline(true);
  await editItem(A, 'Partner X', { fields: { Password: 'pw-A-24' } });
  await editItem(B, 'Partner X', { fields: { Password: 'pw-B-24' } });
  const fromA = A.responses.length;
  const fromB = B.responses.length;
  await A.setOffline(false);
  await B.setOffline(false);
  await waitClean(A);
  await waitClean(B);
  await nudge(A);
  await waitClean(A);
  const puts = [...responsesSince(A, fromA), ...responsesSince(B, fromB)].filter((r) => r.method === 'PUT' && r.status === 200).length;
  console.log(`KM-006 AC24 accepted pushes after coming online: ${puts}`);
  assert.ok(puts <= 2, String(puts));
  const node = await nodeDevice(env.server, username, PASSWORD);
  const { vault } = await node.read();
  assert.ok(vault.items[0].conflict);
  for (const page of [A, B]) {
    await openItem(page, 'Partner X');
    await page.waitFor(`!!document.querySelector('[data-fk=conflict-badge]')`, { timeout: 15000 });
  }
});

test('KM-006 AC26 FR19 envs added on both offline: the item is in every one of them, no badge', async () => {
  const { A, B } = await pairOn(env, { title: 'Partner X', project: { name: 'PaymentGW', envs: 'uat, staging, prod' } });
  await A.setOffline(true);
  await B.setOffline(true);
  // Item starts unassigned; A adds two envs, B adds the two others.
  for (const [page, envs] of [[A, ['PaymentGW / uat', 'PaymentGW / prod']], [B, ['PaymentGW / staging']]]) {
    await openItem(page, 'Partner X');
    await page.click('Sửa');
    for (const e of envs) await page.click(e);
    await page.click('Lưu');
    await page.waitFor(`!document.querySelector('[data-fk=edit-title]')`);
  }
  await A.setOffline(false);
  await B.setOffline(false);
  await waitClean(A);
  await waitClean(B);
  await nudge(A);
  await waitClean(A);
  for (const page of [A, B]) {
    await openItem(page, 'Partner X');
    for (const e of ['uat', 'staging', 'prod']) await page.waitText(`PaymentGW / ${e}`, { timeout: 15000 });
    assert.equal(await page.eval(`!!document.querySelector('[data-fk=conflict-badge]')`), false);
  }
});

test('KM-006 AC27 FR18 a save while a push is held: still pending after the push, sent next round; server has both', async () => {
  const { A, username } = await pairOn(env);
  let release;
  const held = new Promise((r) => (release = r));
  let seen = 0;
  const off = await A.intercept('*/api/vaults/*', async (req) => {
    if (req.method !== 'PUT') return 'continue';
    if (++seen === 1) await held;
    return 'continue';
  });
  await editItem(A, 'Partner X', { fields: { Password: 'pw-first-27' } });
  await until(() => seen >= 1, { timeout: 15000, what: 'the push to be held' });
  await editItem(A, 'Partner X', { notes: 'second save 27' });
  release();
  await waitClean(A, 30000);
  await off();
  const { vault } = await (await nodeDevice(env.server, username, PASSWORD)).read();
  assert.equal(vault.items[0].fields.find((f) => f.label === 'Password').v, 'pw-first-27');
  assert.equal(vault.items[0].notes, 'second save 27');
  assert.ok(seen >= 2, 'the second save was pushed in a round of its own');
});

test('KM-006 AC28 AC29 FR22 a form open while the other device changes the item: typed text kept; untouched values from B stay; same field: the user wins', async () => {
  const { A, B } = await pairOn(env);
  await openItem(A, 'Partner X');
  await A.click('Sửa');
  await A.fill('Giá trị Password', 'pw-typed-by-A');
  await editItem(B, 'Partner X', { fields: { Username: 'user-from-B' } });
  await waitClean(B);
  await nudge(A);
  await A.waitFor(`${READ_DB_ALL}.then((d) => d.rows[0].current.version >= 2)`, { timeout: 15000, what: 'A pulled B' });
  assert.equal(await A.value('Giá trị Password'), 'pw-typed-by-A', 'typed text survives the pull');
  await A.click('Lưu');
  await A.waitFor(`!document.querySelector('[data-fk=edit-title]')`);
  await A.waitText('user-from-B');
  await A.click('Hiện Password');
  await A.waitText('pw-typed-by-A');
  assert.equal(await A.eval(`!!document.querySelector('[data-fk=conflict-badge]')`), false, 'AC28: no mark');
  // AC29: the same field.
  await A.click('Sửa');
  await A.fill('Giá trị Password', 'pw-A-wins');
  await waitClean(A);
  await nudge(B);
  await editItem(B, 'Partner X', { fields: { Password: 'pw-from-B-29' } });
  await waitClean(B);
  await nudge(A);
  await A.waitFor(`${READ_DB_ALL}.then((d) => d.rows[0].current.version >= 4)`, { timeout: 15000, what: 'A pulled B again' });
  await A.click('Lưu');
  await A.waitFor(`!document.querySelector('[data-fk=edit-title]')`);
  await A.click('Hiện Password');
  await A.waitText('pw-A-wins');
  await A.click('Lịch sử');
  const revealAll = `[...document.querySelectorAll('dialog[open] button')].filter((b) => b.textContent.includes('Hiện')).forEach((b) => b.click())`;
  await A.eval(revealAll);
  await A.waitText('pw-from-B-29');
  await A.key('Escape');
});

test('KM-006 AC30 FR26 the server took a push but the answer was cut and the tab reloaded: data matches, no new mark, no extra push', async () => {
  const { A, username } = await pairOn(env);
  const off = await A.intercept('*/api/vaults/*', (req) => (req.method === 'PUT' ? 'fail' : 'continue'), { stage: 'Response' });
  await editItem(A, 'Partner X', { fields: { Password: 'pw-cut-30' } });
  await until(() => A.responses.some((r) => r.method === 'PUT' && r.status === 0), { timeout: 15000, what: 'the cut push' });
  await off();
  const versionOnServer = env.server.sql('SELECT version FROM dt_vault WHERE id = ?', (await A.eval(READ_DB_ALL)).rows[0].id)[0].version;
  await A.reload();
  const from = A.responses.length;
  await unlock(A);
  await waitClean(A, 15000);
  assert.equal(responsesSince(A, from, (r) => r.method === 'PUT').length, 0, 'no extra push');
  const rowId = (await A.eval(READ_DB_ALL)).rows[0].id;
  assert.equal(env.server.sql('SELECT version FROM dt_vault WHERE id = ?', rowId)[0].version, versionOnServer);
  const { vault } = await (await nodeDevice(env.server, username, PASSWORD)).read();
  assert.equal(vault.items[0].conflict, null);
  assert.equal(vault.items[0].fields.find((f) => f.label === 'Password').v, 'pw-cut-30');
});
