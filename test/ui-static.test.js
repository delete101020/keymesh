// Scans the served files for what docs/04 and FR47 forbid. Works on source text, so it runs anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isNode, readRepoFile } from '../testkit/helpers.js';

const skip = isNode ? false : 'reads the file list through node:fs';

async function publicFiles() {
  const { readdir } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../src/public/', import.meta.url));
  const names = await readdir(root, { recursive: true });
  return names.filter((n) => /\.(js|css|html)$/.test(n)).map((n) => n.replaceAll('\\', '/'));
}

async function sources(filter) {
  const out = [];
  for (const n of (await publicFiles()).filter(filter)) out.push({ name: n, text: await readRepoFile(`src/public/${n}`) });
  return out;
}

const ownJs = (n) => n.endsWith('.js') && !n.endsWith('wordlist.js') && !n.startsWith('js/core/');

test('KM-003 NFR01 NFR05 no markup injection, eval, inline handlers or console in client code', { skip }, async () => {
  const banned = [/\.innerHTML/, /\.outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function/, /\bconsole\./, /setAttribute\(\s*['"](style|on\w+)/];
  for (const { name, text } of await sources(ownJs)) {
    for (const re of banned) assert.doesNotMatch(text, re, `${name}: ${re}`);
  }
});

test('KM-003 NFR01 index.html has no inline script, style, handlers or external URL', { skip }, async () => {
  const html = await readRepoFile('src/public/index.html');
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\son\w+\s*=/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  const scripts = html.match(/<script[^>]*>/gi);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /type="module" src="js\/ui\/shell\.js"/);
});

test('KM-004 the page opts out of browser translation, which would send what is on screen to a third party', { skip }, async () => {
  const html = await readRepoFile('src/public/index.html');
  assert.match(html, /<html[^>]*translate="no"/);
  assert.match(html, /<meta name="google" content="notranslate">/);
});

test('KM-003 NFR04 NFR06 only relative imports with .js, nothing loaded from another origin', { skip }, async () => {
  const urlAllowed = /www\.w3\.org\/2000\/svg|otpauth:|https?:\/\/127/;
  for (const { name, text } of await sources((n) => n.endsWith('.js') && !n.endsWith('wordlist.js'))) {
    for (const m of text.matchAll(/\bfrom\s+'([^']+)'|\bimport\s*\(\s*'([^']+)'/g)) {
      assert.match(m[1] ?? m[2], /^\.\.?\/.*\.js$/, name);
    }
    for (const m of text.matchAll(/https?:\/\/[^\s'"`)]+/g)) assert.match(m[0], urlAllowed, `${name}: ${m[0]}`);
  }
  for (const { name, text } of await sources((n) => n.endsWith('.css'))) {
    assert.doesNotMatch(text, /url\(|@import/, name);
  }
});

test('KM-003 NFR06 KM-005 NFR09 no third-party package except wrangler, pinned', { skip }, async () => {
  const pkg = JSON.parse(await readRepoFile('package.json'));
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  // The one exception of CLAUDE.md, from KM-005 on, pinned to an exact version (KM-005 NFR09).
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), ['wrangler']);
  assert.match(pkg.devDependencies.wrangler, /^\d+\.\d+\.\d+$/);
});

test('KM-003 AC45 NFR01 the local server sends exactly the CSP of docs/04', { skip }, async () => {
  const { CSP } = await import('../testkit/serve.mjs');
  const docs = await readRepoFile('docs/04-security.md');
  assert.ok(docs.includes(`\`${CSP}\``));
});

test('KM-003 AC44 FR47 no out-of-scope feature appears in UI strings', { skip }, async () => {
  const banned = /thùng rác|đăng nhập|đăng xuất|đồng bộ|backup|sao lưu|import\b|export\b|passkey|vân tay|đổi mật khẩu|chọn vault|\btag\b|\bthẻ\b/i;
  for (const { name, text } of await sources((n) => n.startsWith('js/ui/') || n === 'index.html')) {
    // Only string literals count; code comments and JS keywords like `import` do not.
    for (const m of text.matchAll(/'([^'\n]*)'|`([^`\n]*)`|>([^<\n]+)</g)) {
      const s = m[1] ?? m[2] ?? m[3];
      if (/^\.\.?\//.test(s)) continue;
      assert.doesNotMatch(s, banned, `${name}: ${s}`);
    }
  }
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));

test('KM-003 AC51 NFR10 text colours reach 4.5:1 in both themes', { skip }, async () => {
  const css = await readRepoFile('src/public/styles.css');
  const light = tokens(/:root\{[\s\S]*?\n\}/.exec(css)[0]);
  const dark = { ...light, ...tokens(/prefers-color-scheme:dark\)\{:root\{[\s\S]*?\}\}/.exec(css)[0]) };
  const pairs = [
    ['text', 'bg'], ['text', 'panel'], ['text', 'panel2'], ['muted', 'bg'], ['muted', 'panel'], ['muted', 'panel2'],
    ['accent', 'bg'], ['accent', 'panel'], ['accent-text', 'accent'], ['danger', 'panel'], ['danger', 'panel2'], ['danger', 'danger-bg'],
    ['warn', 'warn-bg'], ['warn', 'panel'], ['warn', 'bg'], ['chip-text', 'chip'], ['shared-text', 'shared'], ['shared-text', 'panel'], ['shared-text', 'bg'], ['bg', 'text'], ['bg', 'danger'],
  ];
  for (const [name, set] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg] of pairs) {
      const c = contrast(set[fg], set[bg]);
      assert.ok(c >= 4.5, `${name}: ${fg} on ${bg} is ${c.toFixed(2)}`);
    }
  }
});
