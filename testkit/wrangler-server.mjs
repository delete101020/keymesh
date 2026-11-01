// A real `wrangler pages dev` on a free port with throwaway data, for test/server/*.server.js. Time, broken
// storage and revoked sessions are produced by editing the local SQLite file, so src/functions needs no
// test path (KM-005 NFR11). Bindings go by flag: `pages dev` ignores the ones in wrangler.toml.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const SRC = fileURLToPath(new URL('../src/', import.meta.url));
export const WRANGLER = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));
export const DB_NAME = 'keymesh';
export const DB_ID = '00000000-0000-4000-8000-000000000005'; // same as src/wrangler.toml

export const ORIGIN = 'https://app.keymesh.test';
export const REGISTRATION_TOKEN = `km005-registration-${randomBytes(24).toString('hex')}`;
export const SERVER_SECRET = `km005-server-secret-${randomBytes(24).toString('hex')}`;
const DEFAULTS = { ALLOWED_ORIGINS: ORIGIN, REGISTRATION_TOKEN, SERVER_SECRET };

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

export function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(output) : reject(new Error(`${command} exited ${code}: ${output}`))));
  });
}

// --- values that must never reach a log (AC52) --------------------------------------------------------

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const hex = (bytes) => Buffer.from(bytes).toString('hex');

// A string in its own form and as the base64 and hex of its UTF-8 bytes.
export const stringForms = (value) => [value, b64(Buffer.from(value)), hex(Buffer.from(value))];
export const byteForms = (bytes) => [b64(bytes), Buffer.from(b64(bytes)).toString('base64url'), hex(bytes)];

const remember = (needles, json) => {
  if (json === null || typeof json !== 'object') return;
  for (const [key, value] of Object.entries(json)) {
    // Short values are tests' throwaway input ('wrong', ''), not secrets, and would match by chance.
    if (typeof value === 'string' && value.length >= 24 && ['token', 'authKey', 'registrationToken', 'ct'].includes(key)) needles.add(value);
    else remember(needles, value);
  }
};

// --- server ------------------------------------------------------------------------------------------

// `vars` overrides the defaults; a value of undefined leaves that binding unset.
export async function startServer(vars = {}) {
  const root = await mkdtemp(join(tmpdir(), 'keymesh-server-'));
  const dataDir = join(root, 'data');
  const logPath = join(root, 'logs');
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: logPath };
  const bindings = { ...DEFAULTS, ...vars };
  const needles = new Set([REGISTRATION_TOKEN, SERVER_SECRET]);
  for (const value of Object.values(vars)) if (typeof value === 'string' && value.length >= 16) needles.add(value);

  await run(WRANGLER, ['d1', 'migrations', 'apply', DB_NAME, '--local', '--persist-to', dataDir], { cwd: SRC, env });
  const d1Dir = join(dataDir, 'v3/d1/miniflare-D1DatabaseObject');
  const dbFile = join(d1Dir, (await readdir(d1Dir)).find((n) => n.endsWith('.sqlite') && n !== 'metadata.sqlite'));

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const flags = Object.entries(bindings).flatMap(([k, v]) => (v === undefined ? [] : ['--binding', `${k}=${v}`]));
  const child = spawn(
    WRANGLER,
    ['pages', 'dev', 'public', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', dataDir, '--d1', `DB=${DB_ID}`, '--inspector-port', String(await freePort()), ...flags],
    { cwd: SRC, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  );
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise((resolve) => child.on('exit', resolve));
  // A failed test must not keep the runner alive on a server it never reached stop() for.
  child.unref();
  child.stdout.unref();
  child.stderr.unref();
  const killOnExit = () => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  };
  process.once('exit', killOnExit);

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangler exited: ${output}`);
    if (Date.now() > deadline) throw new Error(`wrangler not ready: ${output}`);
    try {
      await fetch(`${url}/api/__ready`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // A short-lived connection per call: the server must see every edit at once, and WAL readers stay few.
  const withDb = (fn) => {
    const db = new DatabaseSync(dbFile, { timeout: 5000 });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  };

  const server = {
    url,
    dataDir,
    dbFile,
    logPath,
    output: () => output,
    needles,
    sql: (query, ...params) => withDb((db) => db.prepare(query).all(...params)),
    exec: (query) => withDb((db) => db.exec(query)),

    // `ip` becomes CF-Connecting-IP. Without it local wrangler reports 127.0.0.1. `via` is a startEdge() url.
    async call(method, path, { token, json, raw, headers = {}, origin, ip, via = url } = {}) {
      const sent = { ...headers };
      if (token !== undefined) sent.Authorization = `Bearer ${token}`;
      if (origin !== undefined) sent.Origin = origin;
      if (ip !== undefined) sent['CF-Connecting-IP'] = ip;
      let body = raw;
      if (json !== undefined) {
        remember(needles, json);
        body = JSON.stringify(json);
        sent['Content-Type'] = 'application/json';
      }
      const init = { method, headers: sent, body, redirect: 'manual' };
      if (body instanceof ReadableStream) init.duplex = 'half';
      const response = await fetch(`${via}${path}`, init);
      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {}
      remember(needles, parsed);
      return { status: response.status, headers: response.headers, text, body: parsed };
    },

    // Every log of this server, scanned at stop: a leak fails the test file that caused it (AC52).
    async stop() {
      // Its own process group: wrangler sits on a wrapper and workerd, and does not always honour SIGTERM.
      const signal = (name) => {
        try {
          process.kill(-child.pid, name);
        } catch {}
      };
      signal('SIGTERM');
      const force = setTimeout(() => signal('SIGKILL'), 3000);
      await exited;
      clearTimeout(force);
      signal('SIGKILL');
      process.off('exit', killOnExit);
      let logs = output;
      for (const name of await readdir(logPath).catch(() => [])) logs += await readFile(join(logPath, name), 'utf8');
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
      const found = [...needles].filter((needle) => stringForms(needle).some((form) => logs.includes(form)));
      if (found.length) throw new Error(`${found.length} secret value(s) reached the server log`);
      return logs;
    },
  };
  return server;
}

// A stand-in for what Cloudflare is documented to do: overwrite CF-Connecting-IP with the address it saw.
// It shows how the server behaves given that overwrite, not that Cloudflare does it (AC25, see KM-006).
export async function startEdge(server, realIp) {
  const edge = createHttpServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const headers = { ...request.headers, 'cf-connecting-ip': realIp };
      for (const name of ['host', 'connection', 'content-length']) delete headers[name];
      const upstream = await fetch(`${server.url}${request.url}`, { method: request.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: 'manual' });
      // fetch has already decoded the body, so these two no longer describe it.
      const sent = new Headers(upstream.headers);
      sent.delete('content-encoding');
      sent.delete('content-length');
      response.writeHead(upstream.status, Object.fromEntries(sent));
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(502).end();
    }
  });
  await new Promise((resolve) => edge.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${edge.address().port}`,
    stop: () => {
      edge.closeAllConnections();
      return new Promise((resolve) => edge.close(resolve));
    },
  };
}

// --- request bodies ----------------------------------------------------------------------------------

let counter = 0;
export const uniqueName = (prefix = 'user') => `${prefix}-${process.pid}-${++counter}`;
// A different documentation-range address per call, so tests never share an IP counter by accident.
export const uniqueIp = () => {
  const n = ++counter;
  return `198.51.${(n >> 8) & 0xff}.${n & 0xff}`;
};

const random64 = (n) => randomBytes(n).toString('base64');
export const newVaultId = () => randomBytes(8).toString('hex');
export const newAuthKey = () => random64(32);
export const newKdf = () => ({ name: 'PBKDF2-SHA256', iter: 600000, salt: random64(16) });
export const newWrappedAccountKey = () => ({ iv: random64(12), ct: random64(48) });
export const newWrappedVaultKey = () => ({ by: 'account', iv: random64(12), ct: random64(48) });
export const newMeta = () => ({ iv: random64(12), ct: random64(64) });
export const newBlob = (bytes = 256) => ({ format: 'keymesh', v: 2, alg: 'AES-GCM-256', iv: random64(12), ct: random64(bytes) });
export const newVault = (over = {}) => ({ id: newVaultId(), wrappedVaultKey: newWrappedVaultKey(), meta: newMeta(), blob: newBlob(), ...over });

export const registerBody = (over = {}) => ({
  registrationToken: REGISTRATION_TOKEN,
  username: uniqueName(),
  kdf: newKdf(),
  authKey: newAuthKey(),
  wrappedAccountKey: newWrappedAccountKey(),
  vault: newVault(),
  deviceName: 'Device A',
  ...over,
});

// Registers through the API and returns what a device would hold.
export async function createAccount(server, over = {}) {
  const body = registerBody(over);
  const response = await server.call('POST', '/api/register', { json: body });
  if (response.status !== 201) throw new Error(`register returned ${response.status}: ${response.text}`);
  return { ...body, userId: response.body.userId, token: response.body.token, vaultId: body.vault.id, blob: body.vault.blob };
}

// Headers that may differ between two otherwise identical responses.
const TIME_DEPENDENT = new Set(['date', 'cf-ray', 'report-to', 'nel', 'server-timing']);
export const comparable = (response) => ({
  status: response.status,
  text: response.text,
  headers: [...response.headers].filter(([name]) => !TIME_DEPENDENT.has(name.toLowerCase())).sort(),
});
