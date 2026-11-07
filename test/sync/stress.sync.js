// KM-006 AC48 (NFR06, NFR07): 100 saves through the screens on two devices, mixed with lost network,
// reloads and writes at the same moment. Every saved value must survive in the vault or its history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_MAX } from '../../src/public/js/core/model.js';
import {
  PASSWORD,
  READ_DB_ALL,
  createItem,
  editItem,
  nodeDevice,
  nudge,
  pairOn,
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

const ITEMS = 10;

test('KM-006 AC48 NFR06 NFR07 100 saves with network loss, reloads and concurrent writes: nothing lost, both devices the same', async () => {
  const { A, B, username } = await pairOn(env, { title: 'Stress 0' });
  for (let i = 1; i < ITEMS; i++) await createItem(A, { type: 'Note', title: `Stress ${i}` });
  await waitClean(A);
  await nudge(B);
  await B.waitText(`Stress ${ITEMS - 1}`, { timeout: 20000 });
  const saved = []; // { item, value }
  const offline = new Set();
  const save = async (page, i) => {
    const item = `Stress ${i % ITEMS}`;
    const value = `stress-value-${i}`;
    await editItem(page, item, { notes: value });
    saved.push({ item, value });
  };
  let i = 0;
  while (saved.length < 100) {
    const page = i % 2 ? B : A;
    if (i % 7 === 3) {
      const off = !offline.has(page);
      await page.setOffline(off);
      if (off) offline.add(page);
      else offline.delete(page);
    }
    if (i % 13 === 5) {
      await page.reload();
      await unlock(page);
    }
    if (i % 10 === 9) {
      // Both devices save the same item at the same moment.
      await Promise.all([save(A, i), save(B, i + 1000)]);
    } else {
      await save(page, i);
    }
    i++;
  }
  for (const page of [A, B]) await page.setOffline(false);
  // Settle: a few rounds each until both are clean on the same server version.
  const version = async (page) => (await page.eval(READ_DB_ALL)).rows[0];
  await until(async () => {
    await nudge(A);
    await nudge(B);
    await new Promise((r) => setTimeout(r, 1500));
    const [ra, rb] = [await version(A), await version(B)];
    return !ra.current.dirty && !rb.current.dirty && ra.current.version === rb.current.version;
  }, { timeout: 120000, every: 500, what: 'both devices clean on the same version' });
  const [ra, rb] = [await version(A), await version(B)];
  assert.deepEqual(ra.current.envelope, rb.current.envelope, 'the same copy on both');
  const { vault } = await (await nodeDevice(env.server, username, PASSWORD)).read();
  let lost = 0;
  let trimmed = 0;
  for (const { item, value } of saved) {
    const it = vault.items.find((x) => x.title === item);
    const here = it.notes === value || it.history.some((h) => h.notes === value);
    if (here) continue;
    if (it.history.length >= HISTORY_MAX) trimmed++;
    else lost++;
  }
  console.log(`KM-006 AC48 saves: ${saved.length}, iterations: ${i}, lost: ${lost}, cut by HISTORY_MAX: ${trimmed}, final version ${ra.current.version}`);
  assert.equal(lost, 0);
});
