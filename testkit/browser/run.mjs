// Serves the repo root on 127.0.0.1, opens testkit/browser/index.html in headless Chrome/Edge,
// waits for the page to POST its results, prints them and exits 0 (all pass) or 1.
import { createServer } from 'node:http';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, normalize, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TIMEOUT_MS = 180_000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => p && existsSync(p));
}

async function listTests() {
  const names = (await readdir(join(ROOT, 'test'))).filter((n) => n.endsWith('.test.js')).sort();
  return names.map((n) => `/test/${n}`);
}

let finish;
const done = new Promise((r) => (finish = r));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && url.pathname === '/__tests') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(await listTests()));
    }
    if (req.method === 'POST' && url.pathname === '/result') {
      let body = '';
      for await (const chunk of req) body += chunk;
      res.writeHead(204).end();
      return finish(JSON.parse(body));
    }
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT + sep)) return res.writeHead(403).end();
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const pageUrl = `http://127.0.0.1:${server.address().port}/testkit/browser/index.html`;

const browserPath = findBrowser();
let browser;
let profile;
if (browserPath) {
  profile = await mkdtemp(join(tmpdir(), 'keymesh-test-'));
  browser = spawn(
    browserPath,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, pageUrl],
    { stdio: 'ignore' },
  );
} else {
  console.log(`No Chrome/Edge found (set CHROME_PATH). Open manually: ${pageUrl}`);
}

const timer = setTimeout(() => finish(null), TIMEOUT_MS);
const report = await done;
clearTimeout(timer);

browser?.kill();
server.close();
if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});

if (!report) {
  console.log(`Timed out after ${TIMEOUT_MS / 1000} s waiting for ${pageUrl}`);
  process.exit(1);
}

let failed = 0;
for (const r of report.results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : `\n     ${r.error}`}`);
}
console.log(`\n${report.userAgent}`);
console.log(`tests ${report.results.length}  pass ${report.results.length - failed}  fail ${failed}  (${Math.round(report.ms)} ms)`);
process.exit(failed ? 1 : 0);
