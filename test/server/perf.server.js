// NFR07 and the timing half of NFR04, measured over HTTP on the local server. Numbers go to the test output
// as diagnostics; they say nothing about Cloudflare (Concern 5).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, newAuthKey, newBlob, newVault, registerBody, startServer, uniqueIp, uniqueName } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const RUNS = 100;
const P95_LIMIT_MS = 200;
const BLOB_BYTES = 150_000; // about 200 KB once base64-encoded

const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil((p / 100) * values.length) - 1];
const median = (values) => percentile(values, 50);
const timed = async (send) => {
  const start = performance.now();
  const response = await send();
  return { ms: performance.now() - start, response };
};

test('KM-005 AC56 NFR07 each of the 8 operations stays under 200 ms at p95 with a 200 KB blob', async (t) => {
  const account = await createAccount(server, { vault: newVault({ blob: newBlob(BLOB_BYTES) }) });
  const { token, vaultId, username, authKey } = account;
  const blob = newBlob(BLOB_BYTES);
  assert.ok(JSON.stringify(blob).length >= 200_000);
  let version = 1;
  const operations = {
    prelogin: [200, () => server.call('GET', `/api/prelogin?username=${username}`)],
    register: [201, () => server.call('POST', '/api/register', { json: registerBody({ vault: newVault({ blob }) }) })],
    login: [200, () => server.call('POST', '/api/login', { json: { username, authKey }, ip: uniqueIp() })],
    logout: [204, null],
    list: [200, () => server.call('GET', '/api/vaults', { token })],
    create: [201, () => server.call('POST', '/api/vaults', { token, json: newVault({ blob }) })],
    read: [200, () => server.call('GET', `/api/vaults/${vaultId}`, { token })],
    write: [200, async () => {
      const response = await server.call('PUT', `/api/vaults/${vaultId}`, { token, json: { baseVersion: version, blob } });
      version += 1;
      return response;
    }],
  };
  const report = {};
  for (const [name, [status, send]] of Object.entries(operations)) {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      let run = send;
      if (name === 'logout') {
        const session = await server.call('POST', '/api/login', { json: { username, authKey }, ip: uniqueIp() });
        run = () => server.call('POST', '/api/logout', { token: session.body.token });
      }
      const { ms, response } = await timed(run);
      assert.equal(response.status, status, name);
      times.push(ms);
    }
    report[name] = { p50: Number(median(times).toFixed(1)), p95: Number(percentile(times, 95).toFixed(1)), max: Number(Math.max(...times).toFixed(1)) };
    t.diagnostic(`${name}: p50 ${report[name].p50} ms, p95 ${report[name].p95} ms, max ${report[name].max} ms`);
  }
  for (const [name, { p95 }] of Object.entries(report)) assert.ok(p95 <= P95_LIMIT_MS, `${name} p95 ${p95} ms`);
});

test('KM-005 NFR04 unknown username and wrong authKey differ by at most 5 ms at the median over 200 runs each', async (t) => {
  const account = await createAccount(server);
  const known = [];
  const unknown = [];
  const ghost = uniqueName('Ghost');
  for (let i = 0; i < 200; i++) {
    if (i % 2 === 0) server.exec('DELETE FROM sys_auth_attempt');
    // Interleaved, so drift on a busy machine falls on both sides.
    for (const [username, into] of i % 2 ? [[account.username, known], [ghost, unknown]] : [[ghost, unknown], [account.username, known]]) {
      const { ms, response } = await timed(() => server.call('POST', '/api/login', { json: { username, authKey: newAuthKey() }, ip: '198.18.0.9' }));
      assert.equal(response.status, 401);
      into.push(ms);
    }
  }
  const gap = Math.abs(median(known) - median(unknown));
  t.diagnostic(`median wrong authKey ${median(known).toFixed(2)} ms, unknown username ${median(unknown).toFixed(2)} ms, gap ${gap.toFixed(2)} ms`);
  assert.ok(gap <= 5, `gap ${gap} ms`);
});
