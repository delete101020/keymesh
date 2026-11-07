// Two browsers on one real server (KM-006 FR40): a `wrangler pages dev` serving the app and the API on one
// origin, and a Chrome profile per device, so each has its own IndexedDB, Service Worker and network. Faults
// come from outside the app: CDP for the network, the server's SQLite for its data (NFR14).
import { addProject, createItem, PASSWORD, setup, startApp } from './e2e/driver.mjs';
import { REGISTRATION_TOKEN } from './wrangler-server.mjs';
import { startServer } from './wrangler-server.mjs';
import { decryptVault, deriveFromPassword, encryptVault, unwrapAccountKey, unwrapVaultKey, generateVaultKey, wrapVaultKey, encryptVaultMeta } from '../src/public/js/core/crypto.js';
import { createVault } from '../src/public/js/core/model.js';

// One server per test file: the login counters key on 127.0.0.1, so files must not share one (plan §4).
export async function startDevices({ names = ['A', 'B'], vars = {} } = {}) {
  const server = await startServer(vars);
  const devices = {};
  for (const name of names) {
    const app = await startApp({ url: server.url });
    devices[name] = { name, app, page: await app.newPage() };
  }
  return {
    server,
    ...devices,
    devices: Object.values(devices),
    // Another browser on the same server, e.g. a third device logging in later.
    async add(name) {
      const app = await startApp({ url: server.url });
      devices[name] = { name, app, page: await app.newPage() };
      this[name] = devices[name];
      this.devices.push(devices[name]);
      return devices[name];
    },
    // CSP violations on every page of every device, then the server's own log scan for secrets.
    async stop() {
      const csp = [];
      for (const d of Object.values(devices)) {
        csp.push(...(await d.app.allCsp().catch(() => [])));
        await d.app.stop();
      }
      await server.stop();
      if (csp.length) throw new Error(`CSP violations: ${csp.join('; ')}`);
    },
  };
}

// fetch from inside the page, as the app would: same origin, the browser sets Origin.
export const pageFetch = (page, path, init = {}) =>
  page.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify(init)}).then(async (r) => ({ status: r.status, body: await r.text() }), (e) => ({ status: 0, error: e.name }))`);

// Polls until `fn` returns something truthy. For waits on real time (sync cadence), not on the page.
export async function until(fn, { timeout = 10000, every = 100, what = 'condition' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out after ${timeout} ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, every));
  }
}

// --- flows through the real screens -----------------------------------------------------------------

export { PASSWORD, READ_DB, READ_STORES, setup, unlock, createItem } from './e2e/driver.mjs';
export { REGISTRATION_TOKEN } from './wrangler-server.mjs';

let names = 0;
export const newUsername = (prefix = 'km006') => `${prefix}-${process.pid}-${++names}`;

const dialogClosed = (page) => page.waitFor(`!document.querySelector('dialog[open]')`, { what: 'dialog closed', timeout: 30000 });

export async function openSettingsDialog(page) {
  await page.click('Cài đặt');
  await page.waitFor(`document.querySelector('dialog[open]')`, { what: 'settings open' });
}

// Settings → "Đăng ký để đồng bộ". Returns the error text, or '' when the dialog closed on success.
export async function register(page, { username, token, password }) {
  await openSettingsDialog(page);
  await page.click('Đăng ký để đồng bộ');
  await page.fill('Username', username);
  await page.fill('Token đăng ký', token);
  await page.fill('Master password hiện tại', password);
  await page.click('Đăng ký');
  await page.waitFor(`!document.querySelector('dialog[open]') || document.querySelector('dialog[open] .err')?.textContent`, { what: 'register answered', timeout: 30000 });
  return page.eval(`document.querySelector('dialog[open] .err')?.textContent ?? ''`);
}

// From the empty-device screen or the lock screen. Returns 'main', 'choose', or the error text.
export async function login(page, { username, password }) {
  if (await page.has('Đăng nhập tài khoản khác')) await page.click('Đăng nhập tài khoản khác');
  else await page.click('Đăng nhập');
  await page.fill('Username', username);
  await page.fill('Master password', password);
  await page.click('Đăng nhập', { selector: 'button[type=submit]' });
  await page.waitFor(`document.querySelector('[data-fk=lock]') || document.querySelector('dialog[open]') || document.querySelector('.err')?.textContent`, { what: 'login answered', timeout: 30000 });
  if (await page.eval(`!!document.querySelector('dialog[open]')`)) return 'choose';
  if (await page.eval(`!!document.querySelector('[data-fk=lock]')`)) return 'main';
  return page.eval(`document.querySelector('.err').textContent`);
}

// The rows on disk, from inside the page.
export const rows = async (page) => (await page.eval(READ_DB_ALL)).rows;
export const READ_DB_ALL = `new Promise((resolve, reject) => {
  const open = indexedDB.open('keymesh');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.length) { db.close(); return resolve({ account: null, session: null, passkey: null, settings: null, rows: [] }); }
    const tx = db.transaction(['meta', 'vaults']);
    const m = tx.objectStore('meta');
    const got = {};
    for (const k of ['account', 'session', 'passkey', 'settings']) { const r = m.get(k); r.onsuccess = () => { got[k] = r.result ?? null; }; }
    const v = tx.objectStore('vaults').getAll();
    tx.oncomplete = () => { db.close(); resolve({ ...got, rows: v.result }); };
    tx.onerror = () => reject(tx.error);
  };
})`;

// Every row clean: what this device has is on the server.
export const waitClean = (page, timeout = 30000) =>
  page.waitFor(`${READ_DB_ALL}.then((d) => d.rows.length > 0 && d.rows.every((r) => !r.current.dirty))`, { what: 'all changes synced', timeout });

// The vault on the server, as SQLite has it.
export const serverVaults = (server) => server.sql('SELECT id, version, meta_version, blob, wrapped_vault_key, meta, user_id FROM dt_vault ORDER BY id');

// --- another device in Node, with the real keys (AC35, AC45) -----------------------------------------
// Logs in through the API as a client would and works on vault plaintext with core/, so cases the screens
// cannot make (a trashed item, a second vault) still go through real encryption and the real server.

export async function nodeDevice(server, username, password) {
  const pre = await server.call('GET', `/api/prelogin?username=${encodeURIComponent(username)}`);
  const { encKey, authKey } = await deriveFromPassword(password, pre.body.kdf);
  const login = await server.call('POST', '/api/login', { json: { username, authKey: Buffer.from(authKey).toString('base64'), deviceName: 'Node' } });
  if (login.status !== 200) throw new Error(`login ${login.status}`);
  const { token } = login.body;
  const accountKey = await unwrapAccountKey(login.body.wrappedAccountKey, encKey);
  const keyOf = async (id) => {
    const list = await server.call('GET', '/api/vaults', { token });
    const item = list.body.items.find((v) => v.id === id) ?? list.body.items[0];
    return { item, vaultKey: await unwrapVaultKey(item.wrappedVaultKey, accountKey, item.id) };
  };
  return {
    token,
    async read(id) {
      const { item, vaultKey } = await keyOf(id);
      const got = await server.call('GET', `/api/vaults/${item.id}`, { token });
      return { id: item.id, version: got.body.version, vault: await decryptVault(got.body.blob, vaultKey, item.id) };
    },
    async write(id, vault, baseVersion) {
      const { vaultKey } = await keyOf(id);
      return server.call('PUT', `/api/vaults/${id}`, { token, json: { baseVersion, blob: await encryptVault(vault, vaultKey) } });
    },
    // A second vault made with the account key, as a later epic's screen would (AC35, AC36).
    async createVault(id, name) {
      const vaultKey = await generateVaultKey();
      return server.call('POST', '/api/vaults', {
        token,
        json: { id, wrappedVaultKey: await wrapVaultKey(vaultKey, accountKey, id), meta: await encryptVaultMeta({ name, color: null, order: 1 }, vaultKey, id), blob: await encryptVault(createVault(id), vaultKey) },
      });
    },
  };
}

// --- shared by the flow, failure, cadence, privacy, stress and perf files ---------------------------

// Going to the background and back: the app syncs at once on coming back (FR16).
export async function nudge(page) {
  await page.setBackground(true);
  await page.setBackground(false);
}

export const openItem = (page, title) => page.click(title, { exact: false, selector: '.list .row' });

// Two fresh devices on `env`'s server, one account, one item, both open and clean.
export async function pairOn(env, { title = 'Partner X', values = { Username: 'svc-user', Password: 'pw-base' }, project = null } = {}) {
  const tag = `${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
  const A = (await env.add(`A-${tag}`)).page;
  await setup(A);
  if (project) await addProject(A, project.name, project.envs);
  if (title) await createItem(A, { title, values });
  const username = newUsername('pair');
  const err = await register(A, { username, token: REGISTRATION_TOKEN, password: PASSWORD });
  if (err) throw new Error(`register: ${err}`);
  await waitClean(A);
  const B = (await env.add(`B-${tag}`)).page;
  if ((await login(B, { username, password: PASSWORD })) !== 'main') throw new Error('login B');
  return { A, B, username };
}

// API calls a page made after index `from` of its request log, as "METHOD /path" from the response log.
export const responsesSince = (page, from, filter = () => true) => page.responses.slice(from).filter((r) => r.url && new URL(r.url).pathname.startsWith('/api/') && filter(r));

export async function editItem(page, title, { fields = {}, notes, newTitle } = {}) {
  await openItem(page, title);
  await page.click('Sửa');
  for (const [label, v] of Object.entries(fields)) await page.fill(`Giá trị ${label}`, v);
  if (notes !== undefined) await page.fill('Ghi chú', notes);
  if (newTitle !== undefined) await page.fill('Tiêu đề', newTitle);
  await page.click('Lưu');
  await page.waitFor(`!document.querySelector('[data-fk=edit-title]')`, { what: 'saved' });
}
