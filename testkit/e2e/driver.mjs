// Drives the real app by what a user sees: controls are found by accessible name, clicks and keys are
// real input events. Every page counts CSP violations, console output, errors and network requests.
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome, newProfile, removeProfile } from './cdp.mjs';
import { startServer } from '../serve.mjs';

const SHOTS = process.env.KEYMESH_SHOTS;

// Runs in the page before any app code; a CDP-injected script is exempt from the page's CSP.
const WATCH = `window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));`;

const FIND = `(() => {
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    if (el.labels && el.labels.length) return el.labels[0].innerText.trim();
    return (el.innerText || el.value || '').trim();
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  window.__find = (name, { exact = true, hidden = false, selector = 'button,a,input,select,textarea,summary,[role=button]' } = {}) => {
    const scopes = [...document.querySelectorAll('dialog[open]')];
    const scope = scopes.length ? scopes[scopes.length - 1] : document;
    const all = [...scope.querySelectorAll(selector)];
    return all.find((el) => (hidden || visible(el)) && (exact ? nameOf(el) === name : nameOf(el).includes(name))) ?? null;
  };
  window.__names = () => [...document.querySelectorAll('button,a,input,select,textarea')].filter(visible).map(nameOf);
})();`;

export class Page {
  constructor(app, sessionId, targetId) {
    this.app = app;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.console = [];
    this.errors = [];
    this.requests = [];
    this.cspLog = [];
    this.downloads = [];
  }

  send(method, params) {
    return this.app.conn.send(method, params, this.sessionId);
  }

  async init(url) {
    for (const d of ['Page', 'Runtime', 'Network', 'Log', 'DOM']) await this.send(`${d}.enable`);
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH + FIND });
    if (url) await this.goto(url);
    return this;
  }

  handle(msg) {
    const p = msg.params;
    if (msg.method === 'Runtime.consoleAPICalled') this.console.push(p.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (msg.method === 'Runtime.exceptionThrown') this.errors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
    if (msg.method === 'Network.requestWillBeSent') this.requests.push(p.request.url);
    if (msg.method === 'Log.entryAdded') {
      this.console.push(p.entry.text);
      if (/content security policy/i.test(p.entry.text)) this.cspLog.push(p.entry.text);
    }
  }

  async addInit(source) {
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor(`document.readyState === 'complete'`);
  }

  async reload() {
    await this.send('Page.reload');
    await new Promise((r) => setTimeout(r, 100));
    await this.waitFor(`document.readyState === 'complete'`);
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  async waitFor(expression, { timeout = 10000, what = expression } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await this.eval(`(() => { try { return (${expression}); } catch { return false; } })()`);
      if (v) return v;
      if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}\nPage text: ${(await this.text()).slice(0, 800)}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  find(name, opts) {
    return `window.__find(${JSON.stringify(name)}, ${JSON.stringify(opts ?? {})})`;
  }

  has(name, opts) {
    return this.eval(`!!${this.find(name, opts)}`);
  }

  async center(name, opts) {
    await this.waitFor(this.find(name, opts), { what: `control "${name}"` });
    return this.eval(`(() => { const el = ${this.find(name, opts)}; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  }

  async click(name, opts) {
    const { x, y } = await this.center(name, opts);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 15));
  }

  async fill(name, value, opts) {
    await this.waitFor(this.find(name, opts), { what: `input "${name}"` });
    await this.eval(`(() => { const el = ${this.find(name, opts)}; el.focus(); el.select?.(); })()`);
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 });
    if (value) await this.send('Input.insertText', { text: value });
  }

  async select(name, value, opts) {
    await this.waitFor(this.find(name, opts), { what: `select "${name}"` });
    await this.eval(`(() => { const el = ${this.find(name, opts)}; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }

  value(name, opts) {
    return this.eval(`(() => { const el = ${this.find(name, opts)}; return el ? el.value : null; })()`);
  }

  text() {
    return this.eval(`document.documentElement.innerText`);
  }

  // Everything in the DOM, not just what is visible, including input values.
  domDump() {
    return this.eval(`(() => {
      const values = [...document.querySelectorAll('input,textarea,select')].map((el) => el.value).join('\\n');
      return document.documentElement.outerHTML + '\\n' + values;
    })()`);
  }

  async waitText(text, opts) {
    await this.waitFor(`document.documentElement.innerText.includes(${JSON.stringify(text)})`, { what: `text "${text}"`, ...opts });
  }

  async waitNoText(text, opts) {
    await this.waitFor(`!document.documentElement.innerText.includes(${JSON.stringify(text)})`, { what: `no text "${text}"`, ...opts });
  }

  async key(key, { code = key, vk = KEY_CODES[key] ?? 0, modifiers = 0, text } = {}) {
    const common = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...common, ...(text ? { text, unmodifiedText: text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await new Promise((r) => setTimeout(r, 10));
  }

  focusedName() {
    return this.eval(`(() => { const el = document.activeElement; return el ? (el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.innerText || el.tagName).trim() : ''; })()`);
  }

  // Tab until the named control has focus. Throws if it is not reachable by keyboard.
  async tabTo(name, { max = 60, shift = false } = {}) {
    for (let i = 0; i < max; i++) {
      const hit = await this.eval(`(() => { const el = document.activeElement; const t = ${this.find(name)}; return !!t && el === t; })()`);
      if (hit) return;
      await this.key('Tab', { modifiers: shift ? 8 : 0 });
    }
    throw new Error(`"${name}" not reachable by Tab; focus is on "${await this.focusedName()}"`);
  }

  async setFiles(selector, files) {
    const { root } = await this.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await this.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`no node for ${selector}`);
    await this.send('DOM.setFileInputFiles', { nodeId, files });
  }

  async viewport(width, height = 800) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 50));
  }

  async colorScheme(value) {
    await this.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
    await new Promise((r) => setTimeout(r, 50));
  }

  async shot(name) {
    if (!SHOTS) return;
    await mkdir(SHOTS, { recursive: true });
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  }

  cspViolations() {
    return this.eval(`window.__csp`).then((list) => [...list, ...this.cspLog]);
  }
}

const KEY_CODES = { Tab: 9, Enter: 13, Escape: 27, ' ': 32, ArrowUp: 38, ArrowDown: 40, k: 75 };

export async function startApp({ args = [] } = {}) {
  const server = await startServer();
  const profile = await newProfile();
  const app = { server, profile, url: server.url, pages: new Map(), cspSeen: [], args };

  async function connect() {
    const chrome = await launchChrome({ profile, args: app.args });
    app.chrome = chrome;
    app.conn = chrome.conn;
    app.conn.onEvent((msg) => app.pages.get(msg.sessionId)?.handle(msg));
    app.pages.clear();
  }
  await connect();

  app.newPage = async (url = app.url) => {
    const { targetId } = await app.conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await app.conn.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(app, sessionId, targetId);
    app.pages.set(sessionId, page);
    await page.init(url);
    return page;
  };
  app.closePage = async (page) => {
    app.cspSeen.push(...(await page.cspViolations().catch(() => [])));
    await app.conn.send('Target.closeTarget', { targetId: page.targetId });
    app.pages.delete(page.sessionId);
  };
  // Quit Chrome and start it again on the same profile, like closing the browser.
  app.restartChrome = async () => {
    for (const p of app.pages.values()) app.cspSeen.push(...(await p.cspViolations().catch(() => [])));
    await app.chrome.stop();
    await connect();
  };
  app.grantClipboard = (origin = new URL(app.url).origin) =>
    app.conn.send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  app.downloadsTo = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'keymesh-dl-'));
    await app.conn.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
    return dir;
  };
  // All violations on every page opened so far; asserted at the end of every E2E file (AC45).
  app.allCsp = async () => {
    const live = [];
    for (const p of app.pages.values()) live.push(...(await p.cspViolations().catch(() => [])));
    return [...app.cspSeen, ...live];
  };
  app.stop = async () => {
    await app.chrome.stop().catch(() => {});
    await server.close();
    await removeProfile(profile);
  };
  return app;
}

// --- flows shared by the E2E files -------------------------------------------------------------

export const PASSWORD = 'correct horse battery staple';

export async function setup(page, password = PASSWORD) {
  await page.fill('Master password', password);
  await page.fill('Nhập lại master password', password);
  await page.click('Tạo tài khoản');
  await page.waitFor(page.find('Khoá'), { what: 'main screen' });
}

export async function unlock(page, password = PASSWORD) {
  await page.fill('Master password', password);
  await page.click('Mở khoá');
  await page.waitFor(page.find('Khoá'), { what: 'main screen' });
}

export async function addProject(page, name, envs) {
  await page.click('Thêm project');
  await page.fill('Tên project', name);
  if (envs !== undefined) await page.fill('Các env', envs);
  await page.click('Tạo project');
  await page.waitFor(`!document.querySelector('dialog[open]')`, { what: 'dialog closed' });
}

// Reads the stored rows straight from IndexedDB, from inside the page.
export const READ_DB = `new Promise((resolve, reject) => {
  const open = indexedDB.open('keymesh');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const names = [...db.objectStoreNames];
    if (!names.length) { db.close(); return resolve({ account: null, rows: [] }); }
    const tx = db.transaction(names);
    const a = tx.objectStore('meta').get('account');
    const r = tx.objectStore('vaults').getAll();
    tx.oncomplete = () => { db.close(); resolve({ account: a.result ?? null, rows: r.result }); };
    tx.onerror = () => reject(tx.error);
  };
})`;

// Grep every file under a directory for strings, in raw and in UTF-16 form. Returns the hits.
export async function grepDir(dir, needles) {
  const hits = [];
  async function walk(d) {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile()) {
        const info = await stat(p).catch(() => null);
        if (!info || info.size > 64 * 1024 * 1024) continue;
        const buf = await readFile(p).catch(() => null);
        if (!buf) continue;
        for (const n of needles) {
          if (buf.includes(Buffer.from(n, 'utf8')) || buf.includes(Buffer.from(n, 'utf16le'))) hits.push(`${n} in ${p}`);
        }
      }
    }
  }
  await walk(dir);
  return hits;
}

export const tempDir = () => mkdtemp(join(tmpdir(), 'keymesh-tmp-'));
export const removeDir = (d) => rm(d, { recursive: true, force: true });

// Creates an item through the form. values: { label: text }, envs: names as "Project / env".
export async function createItem(page, { type = 'Login', title, values = {}, envs = [] }) {
  await page.click('Thêm item');
  await page.click(type);
  await page.fill('Tiêu đề', title);
  for (const [label, v] of Object.entries(values)) await page.fill(`Giá trị ${label}`, v);
  for (const e of envs) await page.click(e);
  await page.click('Lưu');
  await page.waitFor(`document.querySelector('h2[data-fk=detail-title]')?.textContent === ${JSON.stringify(title)}`, { what: `item "${title}" saved` });
}

export const fieldOrderOnScreen = (page) => page.eval(`[...document.querySelectorAll('.field .lbl')].map((x) => x.textContent)`);
