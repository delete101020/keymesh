// Starts Chrome and talks the DevTools Protocol over Node's built-in WebSocket (Node ≥ 22, E2E only).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];

export const newProfile = () => mkdtemp(join(tmpdir(), 'keymesh-e2e-'));
export const removeProfile = (dir) => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});

export class Connection {
  #ws;
  #seq = 0;
  #waiting = new Map();
  #handlers = new Set();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const w = this.#waiting.get(msg.id);
        this.#waiting.delete(msg.id);
        if (msg.error) w?.reject(new Error(`${w.method}: ${msg.error.message}`));
        else w?.resolve(msg.result);
      } else {
        for (const h of this.#handlers) h(msg);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      // A call Chrome never answers must fail the test rather than hang the run.
      const timer = setTimeout(() => {
        this.#waiting.delete(id);
        reject(new Error(`${method}: no answer in 30 s`));
      }, 30000);
      timer.unref();
      this.#waiting.set(id, { resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)), method });
      this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  onEvent(fn) {
    this.#handlers.add(fn);
  }

  close() {
    for (const w of this.#waiting.values()) w.reject(new Error('connection closed'));
    this.#waiting.clear();
    this.#ws.close();
  }
}

export async function launchChrome({ profile, args = [] }) {
  const path = CANDIDATES.find((p) => p && existsSync(p));
  if (!path) throw new Error('Chrome not found; set CHROME_PATH');
  if (typeof WebSocket !== 'function') throw new Error('E2E needs Node ≥ 22 (global WebSocket)');
  const portFile = join(profile, 'DevToolsActivePort');
  await rm(portFile, { force: true });
  const proc = spawn(
    path,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,800', ...args, 'about:blank'],
    { stdio: 'ignore' },
  );
  const exited = new Promise((r) => proc.once('exit', r));
  let wsPath;
  for (let i = 0; i < 300 && !wsPath; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const text = await readFile(portFile, 'utf8').catch(() => '');
    const [port, p] = text.split('\n');
    if (port && p) wsPath = `ws://127.0.0.1:${port}${p}`;
  }
  if (!wsPath) {
    proc.kill();
    throw new Error('Chrome did not start');
  }
  const ws = new WebSocket(wsPath);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
    conn: new Connection(ws),
    async stop() {
      proc.kill();
      await exited;
    },
  };
}
