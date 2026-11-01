// Origin, routing, response headers, error shape and body limit. Every request goes to a real wrangler.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../testkit/wrangler-server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

test('KM-005 harness: a real server on an empty database with the six tables, editable from the test', async () => {
  const tables = server.sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND (name GLOB 'dt_*' OR name GLOB 'sys_*') ORDER BY name`).map((r) => r.name);
  assert.deepEqual(tables, ['dt_audit_log', 'dt_session', 'dt_user', 'dt_vault', 'dt_vault_snapshot', 'sys_auth_attempt']);
  assert.equal(server.sql('SELECT count(*) AS n FROM dt_user')[0].n, 0);
  const response = await server.call('GET', '/api/anything');
  assert.ok(response.status);
});
