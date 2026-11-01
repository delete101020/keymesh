// What the Service Worker, manifest and _headers promise, checked on the files themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isNode, readRepoFile } from '../testkit/helpers.js';

const skip = isNode ? false : 'reads files through node:fs';

test('KM-004 sw.js is in step with src/public (else: npm run sw-version)', { skip }, async () => {
  const { renderSw } = await import('../testkit/sw-version.mjs');
  assert.equal(await readRepoFile('src/public/sw.js'), await renderSw(), 'run npm run sw-version');
});

test('KM-004 AC11 the shell has no /api, no secret-looking file, and nothing is cached at runtime', { skip }, async () => {
  const { shellOf } = await import('../testkit/sw-version.mjs');
  const { shell } = await shellOf();
  assert.ok(shell.includes('./') && shell.includes('js/ui/shell.js') && shell.includes('styles.css') && shell.includes('manifest.webmanifest'));
  for (const n of shell) assert.doesNotMatch(n, /^\/|api|_headers|sw\.js/, n);
  const sw = await readRepoFile('src/public/sw.js');
  assert.doesNotMatch(sw, /\.put\(/);
  assert.match(sw, /startsWith\('\/api\/'\)/);
});

test('KM-004 AC10 _headers carries exactly the CSP of docs/04, the other headers, and allows only the camera', { skip }, async () => {
  const { parseHeaders, headersFor, CSP } = await import('../testkit/serve.mjs');
  const docs = await readRepoFile('docs/04-security.md');
  assert.ok(docs.includes(`\`${CSP}\``), 'CSP matches docs/04');
  const rules = parseHeaders(await readRepoFile('src/public/_headers'));
  const h = headersFor('/', rules);
  assert.equal(h['x-content-type-options'], 'nosniff');
  assert.equal(h['referrer-policy'], 'no-referrer');
  assert.match(h['strict-transport-security'], /max-age=\d+/);
  assert.match(h['permissions-policy'], /(^|, )camera=\(self\)/);
  assert.match(h['permissions-policy'], /microphone=\(\)/);
  // Copy and the passkeys of KM-007 must stay possible.
  assert.doesNotMatch(h['permissions-policy'], /clipboard|publickey/);
  for (const path of ['/', '/index.html', '/sw.js']) assert.equal(headersFor(path, rules)['cache-control'], 'no-cache', path);
  assert.equal(headersFor('/js/app.js', rules)['cache-control'], undefined);
});

const pngSize = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  return [view.getUint32(16), view.getUint32(20)];
};

test('KM-004 AC04 manifest: standalone, relative start and scope, icons exist at their stated size', { skip }, async () => {
  const { readFile } = await import('node:fs/promises');
  const m = JSON.parse(await readRepoFile('src/public/manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  const sizes = new Set();
  for (const icon of m.icons) {
    const bytes = await readFile(new URL(`../src/public/${icon.src}`, import.meta.url));
    if (icon.type !== 'image/png') continue;
    const [w, h] = pngSize(bytes);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
    sizes.add(`${icon.sizes} ${icon.purpose}`);
  }
  for (const need of ['192x192 any', '512x512 any', '512x512 maskable']) assert.ok(sizes.has(need), need);
  const apple = await readFile(new URL('../src/public/icons/apple-touch-icon-180.png', import.meta.url));
  assert.deepEqual(pngSize(apple), [180, 180]);
});
