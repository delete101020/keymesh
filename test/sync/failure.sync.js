// KM-006 AC31–AC37: the server failing, refusing, losing a vault or holding a bad copy, on real browsers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD,
  READ_DB_ALL,
  editItem,
  login,
  nodeDevice,
  nudge,
  pairOn,
  responsesSince,
  startDevices,
  unlock,
  until,
  waitClean,
} from '../../testkit/sync-devices.mjs';

let env;
test.before(async () => {
  env = await startDevices({ names: [] });
});
test.after(() => env?.stop());

const db = (page) => page.eval(READ_DB_ALL);
const statusText = (page) => page.eval(`document.querySelector('.syncbar [role=status]')?.textContent ?? ''`);
const waitStatus = (page, text, timeout = 20000) => page.waitFor(`document.querySelector('.syncbar [role=status]')?.textContent.startsWith(${JSON.stringify(text)})`, { what: `status "${text}"`, timeout });
async function details(page) {
  await page.click('Trạng thái đồng bộ', { exact: false });
  await page.waitFor(`document.querySelector('dialog[open]')`);
  const text = await page.eval(`document.querySelector('dialog[open]').innerText`);
  await page.key('Escape');
  return text;
}
const flipped = (blob) => {
  const b = JSON.parse(blob);
  const ct = Buffer.from(b.ct, 'base64');
  ct[ct.length - 1] ^= 1;
  return JSON.stringify({ ...b, ct: ct.toString('base64') });
};

test('KM-006 AC31 FR24 NFR08 a failing push retries after 2, 5, 15, 60, 60 s (±20%); recovers by itself in ≤ 65 s, ≤ 5 s on online', async () => {
  const { A } = await pairOn(env);
  const times = [];
  let failing = true;
  const off = await A.intercept('*/api/vaults/*', (req) => {
    if (req.method !== 'PUT') return 'continue';
    times.push(Date.now());
    return failing ? { status: 500, body: { error: 'internal', message: 'x' } } : 'continue';
  });
  await editItem(A, 'Partner X', { fields: { Password: 'pw-31' } });
  await until(() => times.length >= 6, { timeout: 200000, every: 250, what: 'six attempts' });
  const gaps = times.slice(1, 6).map((t, i) => (t - times[i]) / 1000);
  console.log(`KM-006 AC31 gaps between attempts: ${gaps.map((g) => g.toFixed(1)).join(', ')} s`);
  [2, 5, 15, 60, 60].forEach((want, i) => assert.ok(Math.abs(gaps[i] - want) <= want * 0.2, `gap ${i}: ${gaps[i]} vs ${want}`));
  assert.ok((await db(A)).rows[0].current.dirty, 'the change is still on the device');
  failing = false;
  const back = Date.now();
  await waitClean(A, 70000);
  const recovered = (Date.now() - back) / 1000;
  console.log(`KM-006 AC31 recovered without any event after: ${recovered.toFixed(1)} s`);
  assert.ok(recovered <= 65);
  await off();
  // The online event.
  await A.setOffline(true);
  await editItem(A, 'Partner X', { fields: { Password: 'pw-31-online' } });
  await waitStatus(A, 'Offline');
  await new Promise((r) => setTimeout(r, 3000));
  const t0 = Date.now();
  await A.setOffline(false);
  await waitClean(A, 10000);
  const onOnline = (Date.now() - t0) / 1000;
  console.log(`KM-006 AC31 after the online event: ${onOnline.toFixed(1)} s`);
  assert.ok(onOnline <= 5);
});

test('KM-006 AC32 FR25 a session gone on the server: still usable, red "Cần đăng nhập lại", no request, log in with the password only, changes go up', async () => {
  const { A, username } = await pairOn(env);
  const userId = (await db(A)).account.userId;
  env.server.exec(`DELETE FROM dt_session WHERE user_id = '${userId}'`);
  await nudge(A);
  await waitStatus(A, 'Cần đăng nhập lại');
  assert.equal(await A.eval(`document.querySelector('.syncbar').classList.contains('tone-red')`), true);
  assert.deepEqual((await db(A)).session, { token: null, needsLogin: true });
  const from = A.requests.length;
  await editItem(A, 'Partner X', { fields: { Password: 'pw-32' } });
  await new Promise((r) => setTimeout(r, 5000));
  await A.reload();
  await unlock(A);
  await nudge(A);
  await new Promise((r) => setTimeout(r, 3000));
  assert.equal(A.requests.slice(from).filter((u) => u.includes('/api/')).length, 0, 'nothing sent, reload included');
  await A.click('Trạng thái đồng bộ', { exact: false });
  await A.click('Đăng nhập lại');
  assert.equal(await A.value('Username'), username, 'username filled in');
  await A.fill('Master password', PASSWORD);
  await A.click('Đăng nhập', { selector: 'button[type=submit]' });
  await waitClean(A, 20000);
  const { vault } = await (await nodeDevice(env.server, username, PASSWORD)).read();
  assert.equal(vault.items[0].fields.find((f) => f.label === 'Password').v, 'pw-32');
});

test('KM-006 AC33 FR25 403, 400, 404, 413 on push: the cause in the details, data kept; not again within a minute', async () => {
  const { A } = await pairOn(env);
  const causes = { 403: 'Server từ chối yêu cầu', 400: 'Server không nhận dữ liệu gửi lên', 404: 'Server không còn vault này', 413: 'vượt giới hạn' };
  let status = 403;
  const puts = [];
  const off = await A.intercept('*/api/vaults/*', (req) => (req.method === 'PUT' ? (puts.push(Date.now()), { status, body: { error: 'x', message: 'x' } }) : 'continue'));
  let n = 0;
  for (const s of [403, 400, 404, 413]) {
    status = s;
    const before = puts.length;
    await editItem(A, 'Partner X', { notes: `note ${++n}` });
    await until(() => puts.length > before, { timeout: 15000, what: `a push answered ${s}` });
    await waitStatus(A, 'Lỗi đồng bộ');
    assert.match(await details(A), new RegExp(causes[s]), String(s));
    assert.ok((await db(A)).rows[0].current.dirty);
  }
  // The last one (413): wait well past the debounce; no new attempt before a minute.
  const last = puts.length;
  await new Promise((r) => setTimeout(r, 50000));
  assert.equal(puts.length, last, 'not again within 50 s');
  await off();
  // 413 is not retried with the same data at all (spec §3.2); a change sends it again.
  await editItem(A, 'Partner X', { notes: 'smaller now' });
  await waitClean(A);
});

test('KM-006 AC34 FR23 a server copy that does not decrypt: nothing changes here, no push for it, an error; a valid copy clears it', async () => {
  const { A } = await pairOn(env);
  const id = (await db(A)).rows[0].id;
  const [good] = env.server.sql('SELECT blob, version FROM dt_vault WHERE id = ?', id);
  env.server.exec(`UPDATE dt_vault SET blob = '${flipped(good.blob)}', version = ${good.version + 1} WHERE id = '${id}'`);
  const before = JSON.stringify((await db(A)).rows);
  await nudge(A);
  await waitStatus(A, 'Lỗi đồng bộ');
  assert.match(await details(A), /không giải mã được/);
  assert.equal(JSON.stringify((await db(A)).rows), before);
  // With a pending change: still no push for this vault.
  const from = A.responses.length;
  await editItem(A, 'Partner X', { notes: 'pending over a bad copy' });
  await new Promise((r) => setTimeout(r, 4000));
  await nudge(A);
  await new Promise((r) => setTimeout(r, 2000));
  assert.equal(responsesSince(A, from, (r) => r.method === 'PUT').length, 0);
  assert.ok((await db(A)).rows[0].current.dirty);
  env.server.exec(`UPDATE dt_vault SET blob = '${good.blob}', version = ${good.version + 2} WHERE id = '${id}'`);
  await nudge(A);
  await waitClean(A);
  await waitStatus(A, 'Đã đồng bộ');
});

test('KM-006 AC35 AC36 FR17 FR27 FR28 a second vault (smaller id) arrives; when it breaks the first still syncs; the shown vault never changes', async () => {
  const { A, username } = await pairOn(env);
  const node = await nodeDevice(env.server, username, PASSWORD);
  const second = '0000000000000001';
  assert.equal((await node.createVault(second, 'Vault thứ hai')).status, 201);
  await nudge(A);
  await A.waitFor(`${READ_DB_ALL}.then((d) => d.rows.length === 2 && d.rows.every((r) => !r.current.dirty))`, { timeout: 20000, what: 'second vault on disk' });
  assert.match(await details(A), /Vault thứ hai/);
  await A.click('Khoá');
  await unlock(A);
  await A.waitText('Vault mặc định');
  // A new device opens the oldest vault, not the one with the smaller id (FR28).
  const C = (await env.add('ac36-new')).page;
  assert.equal(await login(C, { username, password: PASSWORD }), 'main');
  await C.waitText('Vault mặc định');
  // Break the second vault; the first still pushes.
  const [v2] = env.server.sql('SELECT blob, version FROM dt_vault WHERE id = ?', second);
  env.server.exec(`UPDATE dt_vault SET blob = '${flipped(v2.blob)}', version = ${v2.version + 1} WHERE id = '${second}'`);
  await editItem(A, 'Partner X', { notes: 'first vault still syncs' });
  await A.waitFor(`${READ_DB_ALL}.then((d) => !d.rows.find((r) => r.id !== '${second}').current.dirty)`, { timeout: 20000, what: 'first vault pushed' });
  const text = await details(A);
  assert.match(text, /Vault mặc định[\s\S]*Đã đồng bộ/);
  assert.match(text, /không giải mã được/);
  await A.waitText('Vault mặc định');
});

test('KM-006 AC37 FR27 a vault gone from the server, or older there: nothing deleted or overwritten here, an error of its own', async () => {
  const one = await pairOn(env);
  const id = (await db(one.A)).rows[0].id;
  env.server.exec(`DELETE FROM dt_vault WHERE id = '${id}'`);
  await nudge(one.A);

  await waitStatus(one.A, 'Lỗi đồng bộ');
  assert.match(await details(one.A), /Server không còn vault này/);
  assert.equal((await db(one.A)).rows.length, 1);
  await one.A.waitText('Partner X');

  const two = await pairOn(env);
  await editItem(two.A, 'Partner X', { notes: 'version 2' });
  await waitClean(two.A);
  const id2 = (await db(two.A)).rows[0].id;
  env.server.exec(`UPDATE dt_vault SET version = 1 WHERE id = '${id2}'`);
  const before = JSON.stringify((await db(two.A)).rows);
  await nudge(two.A);

  await waitStatus(two.A, 'Lỗi đồng bộ');
  assert.match(await details(two.A), /bản cũ hơn/);
  assert.equal(JSON.stringify((await db(two.A)).rows), before);
  assert.ok(await statusText(two.A));
});
