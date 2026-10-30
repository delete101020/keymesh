import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newKdf,
  deriveFromPassword,
  generateAccountKey,
  generateVaultKey,
  wrapAccountKey,
  wrapVaultKey,
  encryptVault,
  unlockWithPassword,
  newVaultId,
} from '../src/public/js/core/crypto.js';
import { bigVault, isNode } from '../testkit/helpers.js';

// NFR06 thresholds apply on Node only (dev machine); the browser run just prints the numbers.
const RUNS = 5;

async function median(fn) {
  await fn(); // warm-up
  const times = [];
  for (let n = 0; n < RUNS; n++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(RUNS / 2)], times: times.map((t) => Math.round(t)) };
}

test('AC23 NFR06 full unlock (PBKDF2 600k + HKDF + accountKey + vaultKey + 200 KB vault) ≤ 500 ms median', async (t) => {
  const password = 'perf password';
  const kdf = newKdf();
  const { encKey } = await deriveFromPassword(password, kdf);
  const accountKey = await generateAccountKey();
  const vaultKey = await generateVaultKey();
  const vault = bigVault(newVaultId(), 200 * 1024);
  const record = {
    vaultId: vault.vaultId,
    wrappedVaultKey: await wrapVaultKey(vaultKey, accountKey, vault.vaultId),
    envelope: await encryptVault(vault, vaultKey),
  };
  const wrapped = await wrapAccountKey(accountKey, encKey);
  const r = await median(async () => {
    const { vaults } = await unlockWithPassword(password, kdf, wrapped, [record]);
    assert.equal(vaults[0].ok, true);
  });
  t.diagnostic(`AC23 unlock 200 KB: median ${r.median.toFixed(1)} ms, runs ${r.times.join(', ')} ms`);
  if (isNode) assert.ok(r.median <= 500, `median ${r.median} ms > 500 ms`);
});

test('AC23 NFR06 encrypting a 1 MB vault ≤ 200 ms median', async (t) => {
  const vault = bigVault(newVaultId(), 1024 * 1024);
  const vaultKey = await generateVaultKey();
  const r = await median(() => encryptVault(vault, vaultKey));
  t.diagnostic(`AC23 encrypt 1 MB: median ${r.median.toFixed(1)} ms, runs ${r.times.join(', ')} ms`);
  if (isNode) assert.ok(r.median <= 200, `median ${r.median} ms > 200 ms`);
});
