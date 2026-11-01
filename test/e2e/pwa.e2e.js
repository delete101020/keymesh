// Install, offline, new version, /api/*: the real Service Worker on a copy of src/public.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cp, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp, setup, unlock, createItem, swControls, tempDir, removeDir } from '../../testkit/e2e/driver.mjs';
import { writeSw } from '../../testkit/sw-version.mjs';
import { CSP } from '../../testkit/serve.mjs';

let app;
let page;
let root;
before(async () => {
  root = join(await tempDir(), 'public');
  await cp(fileURLToPath(new URL('../../src/public/', import.meta.url)), root, { recursive: true });
  app = await startApp({ root });
  page = await app.newPage();
  await page.waitText('Tạo tài khoản');
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  await removeDir(join(root, '..'));
  assert.deepEqual(csp, [], 'no CSP violation in this file');
});

const newVersion = async (mark) => {
  await appendFile(join(root, 'styles.css'), `\n/* ${mark} */\n`);
  await writeSw(root);
};
const checkForUpdate = () => page.eval(`navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => true)`);
const servedCss = () => page.eval(`fetch('styles.css').then((r) => r.text())`);

test('KM-004 AC04 Chrome finds nothing against installing; the manifest is read as written', async () => {
  await setup(page);
  await swControls(page);
  const manifest = await page.send('Page.getAppManifest');
  assert.deepEqual(manifest.errors, []);
  assert.equal(JSON.parse(manifest.data).display, 'standalone');
  const { installabilityErrors } = await page.send('Page.getInstallabilityErrors');
  assert.deepEqual(installabilityErrors, []);
});

test('KM-004 AC10 real responses carry the headers of _headers; _headers itself is not served', async () => {
  // From outside the browser, so this is what the server sent and not what the Service Worker kept.
  const r = await fetch(app.url);
  assert.equal(r.headers.get('content-security-policy'), CSP);
  assert.match(r.headers.get('permissions-policy'), /camera=\(self\)/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(new URL('sw.js', app.url))).headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(new URL('manifest.webmanifest', app.url))).headers.get('content-type'), 'application/manifest+json');
  assert.equal((await fetch(new URL('_headers', app.url))).status, 404);
});

test('KM-004 AC11 /api/* goes straight to the server under the Service Worker, and is not cached', async () => {
  assert.equal(await page.eval(`fetch('/api/x').then((r) => r.status)`), 404);
  assert.ok(app.server.seen.includes('/api/x'), 'the server saw it');
  const cached = await page.eval(`(async () => {
    const out = [];
    for (const n of await caches.keys()) out.push(...(await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname));
    return out;
  })()`);
  assert.ok(cached.includes('/js/ui/shell.js'));
  assert.ok(!cached.some((p) => p.startsWith('/api')), cached.join());
});

test('KM-004 AC04 with no server: the app opens, a wrong password fails, the right one works, data is there, /api fails', async () => {
  await createItem(page, { title: 'Offline item', values: { Password: 'offline-secret' } });
  await app.serverDown();
  try {
    await page.reload();
    await page.waitFor(page.find('Mở khoá'));
    assert.equal(await page.eval(`fetch('/api/x').then(() => 'answered', () => 'failed')`), 'failed', 'no fallback for /api');
    await page.fill('Master password', 'not the password');
    await page.click('Mở khoá');
    await page.waitText('Sai mật khẩu');
    await unlock(page);
    await page.waitText('Offline item');
    // A page from the cache keeps the protection it was served with.
    const headers = await page.eval(`caches.match('./').then((r) => r.headers.get('content-security-policy'))`);
    assert.equal(headers, CSP);
  } finally {
    await app.serverUp();
  }
});

test('KM-004 AC05 a new version is announced, nothing reloads by itself; the button moves to it', async () => {
  await page.eval(`window.__sameDocument = true`);
  assert.equal(await page.has('Tải lại'), false);
  await newVersion('VERSION-TWO');
  await checkForUpdate();
  await page.waitText('Có phiên bản mới');
  await page.shot('update-banner-1280');
  assert.equal(await page.eval(`window.__sameDocument`), true);
  assert.ok(!(await servedCss()).includes('VERSION-TWO'), 'still on the old version');
  await page.click('Tải lại');
  await page.waitFor(`!window.__sameDocument && document.readyState === 'complete'`, { what: 'reloaded' });
  await page.waitFor(page.find('Mở khoá'));
  assert.ok((await servedCss()).includes('VERSION-TWO'));
  assert.equal(await page.has('Tải lại'), false);
  assert.equal(await page.eval(`caches.keys().then((k) => k.length)`), 1, 'the old cache is gone');
});

test('KM-004 AC05 unsaved edits ask first: Huỷ stays on the form, confirming reloads', async () => {
  await unlock(page);
  await page.click('Thêm item');
  await page.click('Login');
  await page.fill('Tiêu đề', 'Unsaved');
  await page.eval(`window.__sameDocument = true`);
  await newVersion('VERSION-THREE');
  await checkForUpdate();
  await page.waitText('Có phiên bản mới');
  await page.click('Tải lại');
  await page.waitText('Bỏ bản nháp?');
  await page.click('Huỷ');
  assert.equal(await page.value('Tiêu đề'), 'Unsaved');
  assert.equal(await page.eval(`window.__sameDocument`), true);
  await page.click('Tải lại');
  await page.click('Bỏ bản nháp');
  await page.waitFor(`!window.__sameDocument && document.readyState === 'complete'`, { what: 'reloaded' });
  await page.waitFor(page.find('Mở khoá'));
});
