// Serves src/public on 127.0.0.1 under the headers of src/public/_headers, so the app runs locally as
// it will in production. 127.0.0.1 is a secure context, which WebCrypto, Web Locks and the camera require.
//   node testkit/serve.mjs [port]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../src/public', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Only the part of the Cloudflare format this repo uses: a path or `/*` at column 0, then indented
// `Name: value` lines. Rules are applied in file order and a later rule adds to earlier ones.
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: {} });
    else {
      const at = line.indexOf(':');
      rules.at(-1).headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    }
  }
  return rules;
}

const RULES = parseHeaders(readFileSync(join(ROOT, '_headers'), 'utf8'));

export const headersFor = (pathname, rules = RULES) => {
  const out = {};
  for (const r of rules) if (r.path === '/*' || r.path === pathname) Object.assign(out, r.headers);
  return out;
};

export const CSP = headersFor('/')['content-security-policy'];

export async function startServer({ port = 0, root = ROOT } = {}) {
  const seen = [];
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://127.0.0.1');
    seen.push(pathname);
    // Files without their own rule are not meant to be cached by anything but the Service Worker here,
    // so a test never reads a stale file.
    const headers = { 'cache-control': 'no-store', ...headersFor(pathname) };
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, headers).end();
    try {
      const path = normalize(join(root, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
      if (!path.startsWith(root + sep)) return res.writeHead(403, headers).end();
      if (path === join(root, '_headers')) return res.writeHead(404, headers).end();
      const data = await readFile(path);
      res.writeHead(200, { ...headers, 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      return res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      return res.writeHead(404, headers).end();
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, seen, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer({ port: Number(process.argv[2] ?? 8787) });
  console.log(`KeyMesh: ${url}`);
}
