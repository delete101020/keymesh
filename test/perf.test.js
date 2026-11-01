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
import { merge } from '../src/public/js/core/merge.js';
import { bigMergeCase } from '../testkit/merge-gen.js';

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

async function timeMerge(t, label, c) {
  const size = JSON.stringify(c.l).length;
  let m;
  const res = await median(() => {
    m = merge(c.b, c.l, c.r);
  });
  assert.equal(m.items.filter((x) => x.conflict !== null).length, 25, 'half of the 50 items edited on both sides conflict');
  t.diagnostic(`AC27 merge ${label} (${(size / 1024 / 1024).toFixed(2)} MB): median ${res.median.toFixed(1)} ms, runs ${res.times.join(', ')} ms`);
  return { size, median: res.median };
}

// NFR03 names both "~1 MB" and "500 items × 8 fields × 20 history"; the two do not fit together (each
// history entry copies every field, so that shape is ~13 MB). The threshold is held on ~1 MB, the size
// docs/01 gives for a vault; the 20-entry shape is measured and printed only.
test('AC27 KM-002 NFR03 merging a ~1 MB vault (500 items × 8 fields, 10% edited on both sides) ≤ 200 ms median', async (t) => {
  const { size, median: ms } = await timeMerge(t, '500 × 8, no earlier history', bigMergeCase());
  assert.ok(size >= 0.9 * 1024 * 1024 && size <= 1.5 * 1024 * 1024, `vault is ${size} bytes`);
  if (isNode) assert.ok(ms <= 200, `median ${ms} ms > 200 ms`);
});

test('AC27 KM-002 NFR03 (measured only) the 500 × 8 × 20-history shape', async (t) => {
  await timeMerge(t, '500 × 8 × 20 history', bigMergeCase({ history: 20 }));
});
