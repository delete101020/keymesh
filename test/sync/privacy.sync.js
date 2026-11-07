// KM-006 AC47 (NFR01–NFR03): after the §3.1 flow with a conflict, nothing readable on the server, in the
// browsers' storage, in logs, URLs or console, in its own form, base64 or hex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveFromPassword } from '../../src/public/js/core/crypto.js';
import { stringForms, byteForms } from '../../testkit/wrangler-server.mjs';
import {
  PASSWORD,
  READ_DB_ALL,
  READ_STORES,
  REGISTRATION_TOKEN,
  createItem,
  editItem,
  login,
  newUsername,
  nudge,
  register,
  setup,
  startDevices,
  waitClean,
} from '../../testkit/sync-devices.mjs';

let env;
test.before(async () => {
  env = await startDevices({ names: ['A', 'B'] });
});
test.after(() => env?.stop());

const MARK = 'km006plain';

async function filesUnder(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p)));
    else if (e.isFile() && (await stat(p)).size < 64 * 1024 * 1024) out.push(p);
  }
  return out;
}

test('KM-006 AC47 NFR01 NFR02 NFR03 nothing of password, plaintext, authKey or tokens where it must not be', async () => {
  const { A, B, server } = env;
  // §3.1 steps 1–6 with markers in every kind of content.
  await setup(A.page);
  await createItem(A.page, { title: `${MARK}-title`, values: { Username: `${MARK}-user`, Password: `${MARK}-secret`, URL: `https://${MARK}.example` } });
  const username = newUsername('priv');
  assert.equal(await register(A.page, { username, token: REGISTRATION_TOKEN, password: PASSWORD }), '');
  await waitClean(A.page);
  assert.equal(await login(B.page, { username, password: PASSWORD }), 'main');
  await A.page.setOffline(true);
  await B.page.setOffline(true);
  await editItem(A.page, `${MARK}-title`, { fields: { Password: `${MARK}-fromA` }, notes: `${MARK}-noteA` });
  await editItem(B.page, `${MARK}-title`, { fields: { Password: `${MARK}-fromB` } });
  await A.page.setOffline(false);
  await B.page.setOffline(false);
  await waitClean(A.page);
  await waitClean(B.page);
  await nudge(A.page);
  await waitClean(A.page);
  await A.page.waitFor(`!!document.querySelector('.list .row .badge-conflict')`, { timeout: 15000 });
  await A.page.click(`${MARK}-title`, { exact: false, selector: '.list .row' });
  await A.page.click('Đã xử lý');
  await waitClean(A.page);

  const kdf = (await server.call('GET', `/api/prelogin?username=${username}`)).body.kdf;
  const { authKey } = await deriveFromPassword(PASSWORD, kdf);
  const tokens = [];
  for (const d of [A, B]) tokens.push((await d.page.eval(READ_DB_ALL)).session.token);
  const plain = [PASSWORD, `${MARK}-title`, `${MARK}-user`, `${MARK}-secret`, `${MARK}-fromA`, `${MARK}-fromB`, `${MARK}-noteA`, 'Vault mặc định'];
  const forms = (list) => list.flatMap((s) => stringForms(s));
  const authForms = byteForms(authKey);

  // NFR01: every file the local server keeps (D1 SQLite with WAL, KV, caches).
  const serverHits = [];
  const serverNeedles = [...forms(plain), ...authForms, ...forms(tokens), ...stringForms(REGISTRATION_TOKEN)];
  for (const f of await filesUnder(server.dataDir)) {
    const buf = await readFile(f);
    for (const n of serverNeedles) if (buf.includes(Buffer.from(n)) || buf.includes(Buffer.from(n, 'utf16le'))) serverHits.push(`${n.slice(0, 12)}… in ${f.slice(server.dataDir.length)}`);
  }
  assert.deepEqual(serverHits, []);
  // Control: the scan does see what the server is meant to store in clear.
  let control = false;
  for (const f of await filesUnder(server.dataDir)) if ((await readFile(f)).includes(Buffer.from(username))) control = true;
  assert.ok(control, 'the scan finds the username, so it reads the database files');

  // NFR02: browser storage of both devices. The session token is allowed in meta.session only, once.
  for (const d of [A, B]) {
    const stores = await d.page.eval(READ_STORES);
    const found = [...forms(plain.filter((p) => p !== 'Vault mặc định')), ...authForms, ...stringForms(REGISTRATION_TOKEN)].filter((n) => stores.includes(n));
    assert.deepEqual(found, [], d.name);
    const token = (await d.page.eval(READ_DB_ALL)).session.token;
    assert.equal(stores.split(token).length - 1, 1, `${d.name}: token only in meta.session`);
  }

  // NFR03: console, errors and every URL of both pages; the server's own logs are scanned at stop().
  for (const t of tokens) server.needles.add(t);
  server.needles.add(PASSWORD);
  for (const d of [A, B]) {
    const seen = [...d.page.console, ...d.page.errors, ...d.page.requests].join('\n');
    const leaked = [...forms([...plain.filter((p) => p !== 'Vault mặc định'), ...tokens]), ...authForms, REGISTRATION_TOKEN].filter((n) => seen.includes(n));
    assert.deepEqual(leaked, [], d.name);
  }
  console.log(`KM-006 AC47 scanned: ${(await filesUnder(server.dataDir)).length} server files, ${serverNeedles.length} needle forms; 2 browsers; console, errors, URLs`);
});
