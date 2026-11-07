// KM-006 AC38–AC40: how often the app talks to the server, and auto-lock while it does, in real time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READ_DB_ALL,
  editItem,
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

const lists = (page, from) => responsesSince(page, from, (r) => new URL(r.url).pathname === '/api/vaults');
const blobs = (page, from) => responsesSince(page, from, (r) => r.method === 'GET' && /^\/api\/vaults\/[^/]+$/.test(new URL(r.url).pathname));

test('KM-006 AC38 FR29 three quiet polls answer 304 and fetch no blob; one write elsewhere is exactly one fetch', async () => {
  const { A, B } = await pairOn(env);
  await waitClean(A);
  await until(() => lists(B, 0).length >= 1, { timeout: 60000, what: 'first list of B' });
  const from = B.responses.length;
  await until(() => lists(B, from).length >= 3, { timeout: 170000, every: 500, what: 'three polls of B' });
  const quiet = lists(B, from).slice(0, 3).map((r) => r.status);
  console.log(`KM-006 AC38 three polls: ${quiet.join(', ')}; blob fetches: ${blobs(B, from).length}`);
  assert.deepEqual(quiet, [304, 304, 304]);
  assert.equal(blobs(B, from).length, 0);
  await editItem(A, 'Partner X', { notes: 'one write' });
  await waitClean(A);
  const after = B.responses.length;
  await nudge(B);
  await B.waitText('Partner X');
  await until(() => blobs(B, after).length >= 1, { timeout: 15000, what: 'the blob fetch' });
  await new Promise((r) => setTimeout(r, 2000));
  assert.equal(blobs(B, after).length, 1);
});

test('KM-006 AC39 NFR06 NFR10 ten quiet minutes on two browsers: no write, ~1 list per 50 s each (KEYMESH_LONG=1)', { skip: process.env.KEYMESH_LONG ? false : 'set KEYMESH_LONG=1: ten minutes of real time; test/sync-engine.test.js covers it on a passed-in clock' }, async () => {
  const { A, B } = await pairOn(env);
  await waitClean(A);
  await new Promise((r) => setTimeout(r, 5000));
  const id = (await A.eval(READ_DB_ALL)).rows[0].id;
  const version = env.server.sql('SELECT version FROM dt_vault WHERE id = ?', id)[0].version;
  const [fa, fb] = [A.responses.length, B.responses.length];
  await new Promise((r) => setTimeout(r, 10 * 60_000));
  const writes = [...responsesSince(A, fa), ...responsesSince(B, fb)].filter((r) => r.method === 'PUT').length;
  const perDevice = [lists(A, fa).length, lists(B, fb).length];
  console.log(`KM-006 AC39 10 min: PUT ${writes}, lists per device ${perDevice.join(' / ')}, version ${version} -> ${env.server.sql('SELECT version FROM dt_vault WHERE id = ?', id)[0].version}`);
  assert.equal(writes, 0);
  assert.equal(env.server.sql('SELECT version FROM dt_vault WHERE id = ?', id)[0].version, version);
  for (const n of perDevice) assert.ok(n >= 11 && n <= 13, String(n));
});

test('KM-006 AC40 FR15 auto-lock at 1 minute still fires while sync runs; a lock in the middle of a push corrupts nothing', async () => {
  const { A } = await pairOn(env);
  await A.click('Cài đặt');
  await A.select('Tự khoá khi không thao tác', String(60_000));
  await A.key('Escape');
  const t0 = Date.now();
  const from = A.responses.length;
  await A.waitFor(`!!document.querySelector('[data-fk=unlock-pw]')`, { what: 'auto-lock', timeout: 75000 });
  const after = (Date.now() - t0) / 1000;
  console.log(`KM-006 AC40 locked after ${after.toFixed(1)} s with ${lists(A, from).length} poll(s) in between`);
  assert.ok(after >= 58 && after <= 63, String(after));
  assert.ok(lists(A, from).length >= 1, 'sync ran meanwhile and did not hold the lock off');
  await unlock(A);
  // Lock while a push is held, then let it through.
  let release;
  const held = new Promise((r) => (release = r));
  let seen = 0;
  const off = await A.intercept('*/api/vaults/*', async (req) => {
    if (req.method === 'PUT' && ++seen === 1) await held;
    return 'continue';
  });
  await editItem(A, 'Partner X', { notes: 'locked mid-push' });
  await until(() => seen >= 1, { timeout: 15000, what: 'push held' });
  await A.click('Khoá');
  release();
  await new Promise((r) => setTimeout(r, 1500));
  await off();
  await unlock(A);
  await A.waitText('Partner X');
  await waitClean(A, 20000);
  const row = (await A.eval(READ_DB_ALL)).rows[0];
  assert.equal(row.current.version, env.server.sql('SELECT version FROM dt_vault WHERE id = ?', row.id)[0].version);
});
