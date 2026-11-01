// Serves src/public on 127.0.0.1 under the exact CSP of docs/04, so the app runs locally as it will
// in production. 127.0.0.1 is a secure context, which WebCrypto, Web Locks and the camera require.
//   node testkit/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../src/public', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export async function startServer({ port = 0, root = ROOT } = {}) {
  const server = createServer(async (req, res) => {
    const headers = { 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' };
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, headers).end();
    try {
      const { pathname } = new URL(req.url, 'http://127.0.0.1');
      const path = normalize(join(root, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
      if (!path.startsWith(root + sep)) return res.writeHead(403, headers).end();
      const data = await readFile(path);
      res.writeHead(200, { ...headers, 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      return res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      return res.writeHead(404, headers).end();
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer({ port: Number(process.argv[2] ?? 8787) });
  console.log(`KeyMesh: ${url}`);
}
