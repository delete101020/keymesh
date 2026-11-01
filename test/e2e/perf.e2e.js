// NFR08 on the real UI, median of 5, numbers reported as diagnostics. Seeds the vault through the app's
// own modules, then measures what the user waits for.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, setup, unlock, PASSWORD } from '../../testkit/e2e/driver.mjs';

let app;
let page;
before(async () => {
  app = await startApp();
  page = await app.newPage();
  await page.waitText('Tạo tài khoản');
  await setup(page);
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  assert.deepEqual(csp, []);
});

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

// Rewrites the stored vault to about `bytes` of JSON, with `count` login items.
const seed = (count, bytes) => page.eval(`(async () => {
  const c = await import('/js/core/crypto.js');
  const m = await import('/js/core/model.js');
  const s = await import('/js/store.js');
  const store = await s.openStore();
  const account = await store.readAccount();
  const rows = await store.readVaultRows();
  const opened = await c.unlockWithPassword(${JSON.stringify(PASSWORD)}, account.kdf, account.wrappedAccountKey, rows.map(s.toRecord));
  const { vault, vaultKey, vaultId } = opened.vaults[0];
  vault.items = []; vault.projects = []; vault.envs = [];
  const ctx = { now: Date.now(), deviceId: account.deviceId };
  const p = m.addProject(vault, { name: 'Perf' }, ctx);
  const env = m.addEnv(vault, p.id, { name: 'uat' }, ctx);
  const pad = 'x'.repeat(Math.max(0, Math.floor(${bytes} / ${count}) - 900));
  for (let i = 0; i < ${count}; i++) {
    m.createItem(vault, 'login', { title: 'Item ' + i, notes: 'ghi chú ' + i + ' ' + pad, scopes: i % 2 ? [env.id] : [] }, ctx);
  }
  await store.writeVaultCurrent(vaultId, await c.encryptVault(vault, vaultKey), ctx.now);
  store.close();
  return JSON.stringify(vault).length;
})()`);

test('KM-003 AC50 NFR08 unlock with a 200 KB vault ≤ 1.5 s', async (t) => {
  const size = await seed(200, 200000);
  const runs = [];
  for (let i = 0; i < 5; i++) {
    await page.reload();
    await page.waitFor(page.find('Mở khoá'));
    await page.fill('Master password', PASSWORD);
    const ms = await page.eval(`new Promise((resolve) => {
      const t0 = performance.now();
      new MutationObserver(function (_, o) {
        if (document.querySelector('.list .row')) { o.disconnect(); requestAnimationFrame(() => resolve(performance.now() - t0)); }
      }).observe(document.getElementById('root'), { childList: true, subtree: true });
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Mở khoá').click();
    })`);
    runs.push(ms);
    await page.click('Khoá');
  }
  t.diagnostic(`unlock ${Math.round(size / 1000)} KB: median ${median(runs).toFixed(1)} ms, runs ${runs.map((r) => r.toFixed(0)).join(', ')}`);
  assert.ok(median(runs) <= 1500);
});

test('KM-003 AC50 NFR08 saving an item with a 1 MB vault ≤ 500 ms, click to done', async (t) => {
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  const size = await seed(1000, 1000000);
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  await unlock(page);
  await page.click('Item 1');
  const runs = [];
  for (let i = 0; i < 5; i++) {
    await page.click('Sửa');
    await page.fill('Ghi chú', `saved ${i}`);
    const ms = await page.eval(`new Promise((resolve) => {
      const t0 = performance.now();
      new MutationObserver(function (_, o) {
        if (document.getElementById('toast').textContent === 'Đã lưu.' && !document.querySelector('form.stack')) { o.disconnect(); requestAnimationFrame(() => resolve(performance.now() - t0)); }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
      document.getElementById('toast').textContent = '';
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Lưu').click();
    })`);
    runs.push(ms);
  }
  t.diagnostic(`save in a ${Math.round(size / 1000)} KB vault: median ${median(runs).toFixed(1)} ms, runs ${runs.map((r) => r.toFixed(0)).join(', ')}`);
  assert.ok(median(runs) <= 500);
});

test('KM-003 AC50 NFR08 filter and type-to-search with 500 items ≤ 100 ms each', async (t) => {
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  await seed(500, 500000);
  await page.reload();
  await page.waitFor(page.find('Mở khoá'));
  await unlock(page);
  const filterRuns = [];
  const searchRuns = [];
  const measure = (action) => page.eval(`new Promise((resolve) => {
    const t0 = performance.now();
    ${action}
    requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0)));
  })`);
  for (let i = 0; i < 5; i++) {
    const label = i % 2 ? 'Tất cả' : 'Chưa gán';
    filterRuns.push(await measure(`[...document.querySelectorAll('.nav-item')].find((b) => b.getAttribute('aria-label').startsWith(${JSON.stringify(label)})).click();`));
    await new Promise((r) => setTimeout(r, 50));
    searchRuns.push(await measure(`const s = document.querySelector('input[type=search]'); s.value = 'ghi chu ${i}'; s.dispatchEvent(new Event('input', { bubbles: true }));`));
    await new Promise((r) => setTimeout(r, 50));
  }
  t.diagnostic(`filter 500 items: median ${median(filterRuns).toFixed(1)} ms, runs ${filterRuns.map((r) => r.toFixed(0)).join(', ')}`);
  t.diagnostic(`search 500 items: median ${median(searchRuns).toFixed(1)} ms, runs ${searchRuns.map((r) => r.toFixed(0)).join(', ')}`);
  assert.ok(median(filterRuns) <= 100);
  assert.ok(median(searchRuns) <= 100);
});
