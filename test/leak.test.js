import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFromPassword,
  deriveFromPrf,
  wrapAccountKey,
  unwrapAccountKey,
  wrapVaultKey,
  unwrapVaultKey,
  encryptVault,
  decryptVault,
  encryptVaultMeta,
  decryptVaultMeta,
  unlockWithPassword,
  unlockWithAccountKey,
  newKdf,
  _internal,
} from '../src/public/js/core/crypto.js';
import { createVault, createItem, updateItem, restoreItemVersion, validateVault } from '../src/public/js/core/model.js';
import { toHex, toBase64, utf8Encode, randomBytes } from '../src/public/js/core/bytes.js';
import { ctx, flipB64 } from '../testkit/helpers.js';
import { merge } from '../src/public/js/core/merge.js';

const PW = 'PW-MARKER-7f3c9a correct horse';
const PT = 'PT-MARKER-51b2e0';
const ACC_RAW = new Uint8Array(32).fill(0xa5);
const VK_RAW = new Uint8Array(32).fill(0x5a);
const VID = '00000000000000aa';
const OTHER_VID = '00000000000000bb';

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'];

async function collectErrors() {
  const errors = [];
  const expectFail = async (fn) => {
    try {
      const r = await fn();
      // A per-vault failure comes back as a value, not a throw.
      for (const v of r?.vaults ?? []) if (!v.ok) errors.push({ error: v.error, result: v });
    } catch (e) {
      errors.push({ error: e });
    }
  };

  const kdf = newKdf();
  const { encKey, authKey } = await deriveFromPassword(PW, kdf);
  const acc = await _internal.importKey(ACC_RAW, 'account');
  const vk = await _internal.importKey(VK_RAW, 'vault');
  const vault = createVault(VID);
  const item = createItem(vault, 'login', { title: PT, notes: PT }, ctx());
  updateItem(vault, item.id, { fields: item.fields.map((f) => ({ id: f.id, v: `${PT}-${f.label}` })) }, ctx());
  const wrappedAccountKey = await wrapAccountKey(acc, encKey);
  const record = {
    vaultId: VID,
    wrappedVaultKey: await wrapVaultKey(vk, acc, VID),
    meta: await encryptVaultMeta({ name: PT, color: null, order: 0 }, vk, VID),
    envelope: await encryptVault(vault, vk),
  };

  // Wrong password, tampering, wrong context.
  await expectFail(() => unlockWithPassword(PW + 'x', kdf, wrappedAccountKey, [record]));
  await expectFail(() => unwrapAccountKey({ ...wrappedAccountKey, ct: flipB64(wrappedAccountKey.ct, 3) }, encKey));
  await expectFail(() => unlockWithAccountKey(acc, [{ ...record, envelope: { ...record.envelope, ct: flipB64(record.envelope.ct, 30) } }]));
  await expectFail(() => unlockWithAccountKey(acc, [{ ...record, vaultId: OTHER_VID }]));
  await expectFail(() => decryptVault(record.envelope, vk, OTHER_VID));
  await expectFail(() => decryptVaultMeta(record.meta, vk, OTHER_VID));
  await expectFail(() => unwrapVaultKey(record.wrappedVaultKey, acc, OTHER_VID));
  // Authentic ciphertext naming another vault: the plaintext is decrypted but must not surface.
  const iv = randomBytes(12);
  const ct = await _internal.sealBytes(vk, iv, await _internal.gzip(utf8Encode(JSON.stringify(vault))), _internal.aadVault(OTHER_VID));
  await expectFail(() => decryptVault({ format: 'keymesh', v: 2, alg: 'AES-GCM-256', iv: toBase64(iv), ct }, vk, OTHER_VID));
  // Malformed and unsupported input carrying the markers.
  await expectFail(() => deriveFromPassword(PW, { ...kdf, name: PT }));
  await expectFail(() => deriveFromPassword(PW, { ...kdf, salt: PT }));
  await expectFail(() => deriveFromPassword(PW, { ...kdf, iter: 1 }));
  await expectFail(() => decryptVault({ ...record.envelope, format: PT }, vk, VID));
  await expectFail(() => decryptVault({ ...record.envelope, iv: PT }, vk, VID));
  await expectFail(() => decryptVault({ ...record.envelope, ct: PT }, vk, VID));
  await expectFail(() => decryptVault(record.envelope, vk, PT));
  await expectFail(() => unwrapVaultKey({ ...record.wrappedVaultKey, by: PT }, acc, VID));
  await expectFail(() => deriveFromPrf(utf8Encode(PT)));
  await expectFail(() => encryptVault({ ...vault, vaultId: PT }, vk));
  await expectFail(() => createItem(vault, PT, {}, ctx()));
  await expectFail(() => updateItem(vault, item.id, { title: 42 }, ctx()));
  await expectFail(() => updateItem(vault, PT, { title: PT }, ctx()));
  // Validation reports on a vault full of markers.
  const bad = structuredClone(vault);
  bad.v = PT;
  bad.items[0].type = PT;
  bad.items[0].fields[0].kind = PT;
  bad.items[0].fields[0].file = PT;
  const report = validateVault(bad);

  const secrets = [PW, PT, toHex(ACC_RAW), toBase64(ACC_RAW), toHex(VK_RAW), toBase64(VK_RAW), toHex(authKey), toBase64(authKey)];
  return { errors, report, secrets };
}

test('AC22 NFR04 error messages, stacks and failed results carry no password, key bytes or plaintext; core never logs', async () => {
  const counts = Object.fromEntries(CONSOLE_METHODS.map((m) => [m, 0]));
  const saved = CONSOLE_METHODS.map((m) => console[m]);
  CONSOLE_METHODS.forEach((m) => (console[m] = () => counts[m]++));
  let out;
  try {
    out = await collectErrors();
  } finally {
    CONSOLE_METHODS.forEach((m, i) => (console[m] = saved[i]));
  }
  assert.deepEqual(Object.values(counts), CONSOLE_METHODS.map(() => 0), 'core wrote to console');

  const { errors, report, secrets } = out;
  assert.ok(errors.length >= 20, `expected every path to fail, got ${errors.length}`);
  for (const { error, result } of errors) {
    assert.equal(error.name, 'KeymeshError', String(error));
    assert.equal('cause' in error, false);
    const surfaces = [error.message, error.stack, String(error), JSON.stringify(error), result ? JSON.stringify(result) : ''];
    for (const s of surfaces) for (const secret of secrets) assert.ok(!s.includes(secret), `${error.code}: leaked a secret`);
  }
  assert.equal(report.ok, false);
  const text = JSON.stringify(report);
  for (const secret of secrets) assert.ok(!text.includes(secret), 'validateVault leaked a value');
});

test('AC22 KM-002 NFR05 merge errors and console carry no vault value', () => {
  const MARK = 'MERGE-MARKER-9d41c7';
  const good = createVault(VID);
  const item = createItem(good, 'login', { title: MARK, notes: MARK }, ctx());
  updateItem(good, item.id, { fields: item.fields.map((f) => ({ id: f.id, v: `${MARK}-${f.label}` })) }, ctx());
  const bad = (edit) => {
    const v = structuredClone(good);
    edit(v);
    return v;
  };
  const inputs = [
    [good, bad((v) => (v.items[0].type = MARK)), good],
    [good, good, bad((v) => (v.v = MARK))],
    [bad((v) => (v.items[0].fields[0].kind = MARK)), good, good],
    [good, good, { ...structuredClone(good), vaultId: OTHER_VID }],
    [good, bad((v) => (v.items[0].history = MARK)), good],
    [good, MARK, good],
  ];
  const counts = Object.fromEntries(CONSOLE_METHODS.map((m) => [m, 0]));
  const saved = CONSOLE_METHODS.map((m) => console[m]);
  CONSOLE_METHODS.forEach((m) => (console[m] = () => counts[m]++));
  const errors = [];
  try {
    for (const args of inputs) {
      try {
        merge(...args);
        errors.push(null);
      } catch (e) {
        errors.push(e);
      }
    }
    // A successful merge of marked content writes nothing to the console either.
    merge(good, good, good);
  } finally {
    CONSOLE_METHODS.forEach((m, i) => (console[m] = saved[i]));
  }
  assert.deepEqual(Object.values(counts), CONSOLE_METHODS.map(() => 0), 'merge wrote to console');
  for (const e of errors) {
    assert.ok(e, 'every bad input throws');
    assert.equal(e.name, 'KeymeshError');
    assert.equal(e.code, 'invalid');
    assert.equal('cause' in e, false);
    for (const s of [e.message, e.stack, String(e), JSON.stringify(e)]) assert.ok(!s.includes(MARK), 'merge leaked a vault value');
  }
});

test('KM-003 NFR03 a marker in a history entry does not reach an error from restoreItemVersion', () => {
  const vault = createVault(VID);
  const item = createItem(vault, 'login', { title: PT }, ctx());
  const bad = { title: PT, notes: PT, expires: null, fields: [{ id: 'f_0000000000000001', label: PT, kind: PT, v: PT, deletedAt: null }] };
  let error;
  try {
    restoreItemVersion(vault, item.id, bad, ctx());
  } catch (e) {
    error = e;
  }
  assert.equal(error?.code, 'invalid');
  for (const s of [error.message, error.stack, String(error), JSON.stringify(error)]) assert.ok(!s.includes(PT));
});
