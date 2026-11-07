// KM-006 AC49 (NFR09): a 200 KB vault on the dev machine. A round that merges ≤ 2 s with no task over
// 300 ms; an empty device logs in and shows the data ≤ 10 s. The numbers go to implement.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createItem as coreCreateItem, updateItem } from '../../src/public/js/core/model.js';
import {
  PASSWORD,
  READ_DB_ALL,
  editItem,
  login,
  nodeDevice,
  nudge,
  pairOn,
  startDevices,
  waitClean,
} from '../../testkit/sync-devices.mjs';

let env;
test.before(async () => {
  env = await startDevices({ names: [] });
});
test.after(() => env?.stop());

const OBSERVE = `(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false }); return true; })()`;

test('KM-006 AC49 NFR09 200 KB vault: merge round ≤ 2 s, no long task over 300 ms; empty-device login to data ≤ 10 s', async () => {
  const { A, username } = await pairOn(env);
  const node = await nodeDevice(env.server, username, PASSWORD);
  let { id, version, vault } = await node.read();
  const ctx = (t) => ({ now: Date.now() + t, deviceId: 'd_cccccccccccccccc' });
  for (let n = 0; JSON.stringify(vault).length < 200_000; n++) {
    const item = coreCreateItem(vault, 'db', { title: `Database ${n}`, notes: randomBytes(200).toString('hex') }, ctx(n));
    for (const f of item.fields) f.v = randomBytes(24).toString('hex');
  }
  const bytes = JSON.stringify(vault).length;
  assert.equal((await node.write(id, vault, version)).status, 200);
  await nudge(A);
  await A.waitText('Database 0', { timeout: 30000 });
  await waitClean(A);
  // A has a change of its own while another device writes: the next round pulls, merges and pushes.
  await A.setOffline(true);
  await editItem(A, 'Partner X', { notes: 'local while offline' });
  ({ version, vault } = await node.read());
  updateItem(vault, vault.items.find((i) => i.title === 'Database 1').id, { notes: 'remote change' }, ctx(10_000));
  assert.equal((await node.write(id, vault, version)).status, 200);
  await A.eval(OBSERVE);
  const t0 = Date.now();
  await A.setOffline(false);
  await waitClean(A, 20000);
  const round = (Date.now() - t0) / 1000;
  await new Promise((r) => setTimeout(r, 300));
  const longTasks = await A.eval('window.__lt');
  const merged = (await node.read()).vault;
  assert.equal(merged.items.find((i) => i.title === 'Partner X').notes, 'local while offline', 'the round merged and pushed');
  assert.equal(merged.items.find((i) => i.title === 'Database 1').notes, 'remote change');
  const rows = (await A.eval(READ_DB_ALL)).rows;
  const blob = env.server.sql('SELECT size FROM dt_vault WHERE id = ?', rows[0].id)[0].size;
  // Empty device.
  const C = (await env.add('perf-new')).page;
  const t1 = Date.now();
  assert.equal(await login(C, { username, password: PASSWORD }), 'main');
  await C.waitText('Database 0', { timeout: 15000 });
  const fresh = (Date.now() - t1) / 1000;
  console.log(`KM-006 AC49 vault JSON ${bytes} B, blob ${blob} B; merge round ${round.toFixed(2)} s; long tasks ${JSON.stringify(longTasks)} ms; empty-device login to data ${fresh.toFixed(2)} s`);
  assert.ok(round <= 2, String(round));
  assert.ok(longTasks.every((d) => d <= 300), JSON.stringify(longTasks));
  assert.ok(fresh <= 10, String(fresh));
});
