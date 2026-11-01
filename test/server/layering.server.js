// AC57 by machine; a reviewer still reads the unknown-username branch of _auth.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../src/functions/', import.meta.url));

const sources = async () => {
  const names = (await readdir(ROOT, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
  return Promise.all(names.map(async (e) => ({ name: e.name, text: await readFile(join(e.parentPath, e.name), 'utf8') })));
};
const withoutComments = (text) => text.replace(/\/\/.*$/gm, '');

test('KM-005 AC57 NFR10 src/functions imports only itself and core/', async () => {
  const files = await sources();
  assert.ok(files.length >= 7);
  for (const { name, text } of files) {
    const imports = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const path of imports) assert.match(path, /^(?:\.\/_[a-z-]+\.js|\.\.\/\.\.\/public\/js\/core\/[a-z-]+\.js)$/, `${name}: ${path}`);
  }
});

test('KM-005 AC57 NFR11 no path, flag or branch for tests in production code', async () => {
  for (const { name, text } of await sources()) {
    const code = withoutComments(text);
    assert.doesNotMatch(code, /(?<!\.)\b(?:test|tests|testing|mock|fake_time|debug)\b|NODE_ENV|__[A-Z]+__|X-Test|process\.env/i, name);
  }
});

test('KM-005 AC57 NFR10 the server never calls a decrypting or unwrapping operation of core', async () => {
  for (const { name, text } of await sources()) {
    assert.doesNotMatch(withoutComments(text), /\b(?:decrypt\w*|unwrap\w*|unlock\w*|deriveFrom\w*)\b/, name);
  }
});

test('KM-005 CLAUDE.md no console call carries a value beyond a fixed text and an error name', async () => {
  for (const { name, text } of await sources()) {
    for (const [call] of withoutComments(text).matchAll(/console\.\w+\([^)]*\)/g)) {
      assert.match(call, /^console\.error\('api: [a-z ]+', error\?\.name\)$/, `${name}: ${call}`);
    }
  }
});

test('KM-005 AC57 NFR04 the unknown-username branch hashes and compares like the real one', async () => {
  const { text } = (await sources()).find((file) => file.name === '_auth.js');
  const login = text.slice(text.indexOf('export async function login'), text.indexOf('export async function authenticate'));
  const fake = login.indexOf('LABEL_FAKE_AUTH');
  const compare = login.indexOf('safeEqual(await hashAuthKey(body.authKey), expected)');
  const refuse = login.indexOf("new ApiError('invalid_credentials')");
  assert.ok(fake > 0 && compare > fake && refuse > compare, 'the fake is made and compared before any refusal');
  assert.equal(login.indexOf('if (!user', 0), login.lastIndexOf('if (!user'), 'one branch on the user, after the comparison');
  assert.ok(login.indexOf('if (!user') > compare);
});
