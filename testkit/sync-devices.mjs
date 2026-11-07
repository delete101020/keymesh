// Two browsers on one real server (KM-006 FR40): a `wrangler pages dev` serving the app and the API on one
// origin, and a Chrome profile per device, so each has its own IndexedDB, Service Worker and network. Faults
// come from outside the app: CDP for the network, the server's SQLite for its data (NFR14).
import { startApp } from './e2e/driver.mjs';
import { startServer } from './wrangler-server.mjs';

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
