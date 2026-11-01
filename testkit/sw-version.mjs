// Writes VERSION and SHELL into src/public/sw.js from what is actually in src/public, so nobody has
// to remember to bump a number. `npm test` fails when the file is stale.  npm run sw-version
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/public/', import.meta.url));
const NOT_SHELL = new Set(['_headers', 'sw.js', 'index.html']);

export async function shellOf(root = ROOT) {
  const names = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name !== '.DS_Store')
    .map((e) => join(e.parentPath, e.name).slice(resolve(root).length + 1).replaceAll('\\', '/'))
    .sort();
  // The page is cached under `./`: Cloudflare Pages redirects /index.html to /.
  return { names, shell: ['./', ...names.filter((n) => !NOT_SHELL.has(n))] };
}

// `_headers` counts: a cached response keeps the headers it came with, so a new CSP needs a new version.
export async function versionOf(root = ROOT) {
  const { names } = await shellOf(root);
  const hash = createHash('sha256');
  for (const n of names.filter((x) => x !== 'sw.js')) {
    hash.update(`${n}\0`);
    hash.update(await readFile(join(root, n)));
  }
  return hash.digest('hex').slice(0, 16);
}

export async function renderSw(root = ROOT) {
  const text = await readFile(join(root, 'sw.js'), 'utf8');
  const { shell } = await shellOf(root);
  const list = shell.map((n) => `  '${n}',\n`).join('');
  return text
    .replace(/const VERSION = '[^']*';/, `const VERSION = '${await versionOf(root)}';`)
    .replace(/const SHELL = \[[^\]]*\];/, `const SHELL = [\n${list}];`);
}

export async function writeSw(root = ROOT) {
  await writeFile(join(root, 'sw.js'), await renderSw(root));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeSw();
  console.log(`sw.js: ${await versionOf()}`);
}
