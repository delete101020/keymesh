import test from 'node:test';
import assert from 'node:assert/strict';
import { pageFetch, startDevices } from '../../testkit/sync-devices.mjs';

let env;
test.before(async () => {
  env = await startDevices();
});
test.after(() => env?.stop());

test('KM-006 FR40 harness: two profiles reach one server on the app origin, and one goes offline alone', async () => {
  const { A, B } = env;
  for (const d of [A, B]) {
    assert.equal(await d.page.eval('isSecureContext'), true);
    assert.equal((await pageFetch(d.page, '/api/vaults')).status, 401);
    // POST carries Origin: passing the gate shows the app origin is allowed.
    assert.match((await pageFetch(d.page, '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).body, /registration_closed/);
  }
  await A.page.setOffline(true);
  assert.equal(await A.page.eval('navigator.onLine'), false);
  assert.deepEqual(await pageFetch(A.page, '/api/vaults'), { status: 0, error: 'TypeError' });
  assert.equal((await pageFetch(B.page, '/api/vaults')).status, 401);
  await A.page.setOffline(false);
  assert.equal((await pageFetch(A.page, '/api/vaults')).status, 401);
  assert.ok(A.page.responses.some((r) => r.url?.endsWith('/api/vaults') && r.status === 401));
});
