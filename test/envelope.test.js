import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccount,
  unlockWithPassword,
  unlockWithAccountKey,
  encryptVault,
  decryptVault,
  encryptVaultMeta,
  decryptVaultMeta,
  generateAccountKey,
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  wrapAccountKey,
  unwrapAccountKey,
  deriveFromPrf,
  newVaultId,
  newKdf,
  deriveFromPassword,
  _internal,
} from '../src/public/js/core/crypto.js';
import { createVault, createItem, addProject, addEnv } from '../src/public/js/core/model.js';
import { utf8Encode, toBase64, randomBytes } from '../src/public/js/core/bytes.js';
import { ctx, hasCode, flipB64, b64Len, withGlobal } from '../testkit/helpers.js';

const PW = 'đúng mật khẩu 🔑';

function smallVault(vaultId = newVaultId()) {
  const v = createVault(vaultId);
  const p = addProject(v, { name: 'Payment Gateway' }, ctx());
  addEnv(v, p.id, { name: 'uat' }, ctx());
  createItem(v, 'login', { title: 'Partner X portal' }, ctx());
  return v;
}

async function vaultRecord(accountKey, vault = smallVault()) {
  const vaultKey = await generateVaultKey();
  return {
    vault,
    vaultKey,
    record: {
      vaultId: vault.vaultId,
      wrappedVaultKey: await wrapVaultKey(vaultKey, accountKey, vault.vaultId),
      meta: await encryptVaultMeta({ name: 'Work', color: 'blue', order: 1 }, vaultKey, vault.vaultId),
      envelope: await encryptVault(vault, vaultKey),
    },
  };
}

// One account shared by the slow (PBKDF2) tests in this file.
const account = createAccount(PW, { meta: { name: 'Cá nhân', color: null, order: 0 } });

test('AC04 FR12 createAccount then unlockWithPassword opens the default vault offline', async () => {
  const a = await account;
  assert.equal(a.kdf.iter, 600000);
  assert.equal(a.authKey.length, 32);
  assert.equal(a.records.length, 1);
  assert.deepEqual(a.vaults[0].vault, { v: 2, vaultId: a.records[0].vaultId, projects: [], envs: [], items: [] });
  // The stored part is plain JSON.
  const stored = JSON.parse(JSON.stringify({ kdf: a.kdf, wrappedAccountKey: a.wrappedAccountKey, records: a.records }));
  const u = await unlockWithPassword(PW, stored.kdf, stored.wrappedAccountKey, stored.records);
  assert.equal(u.vaults.length, 1);
  assert.equal(u.vaults[0].ok, true);
  assert.deepEqual(u.vaults[0].vault, a.vaults[0].vault);
  assert.deepEqual(u.vaults[0].meta, { name: 'Cá nhân', color: null, order: 0 });
});

test('AC04 FR10 wrong password: decrypt-failed and nothing returned', async () => {
  const a = await account;
  let result;
  await assert.rejects(async () => {
    result = await unlockWithPassword(PW + ' ', a.kdf, a.wrappedAccountKey, a.records);
  }, hasCode('decrypt-failed'));
  assert.equal(result, undefined);
});

test('FR07 vault envelope shape; each save uses a new IV (scenario 3.1.3)', async () => {
  const vault = smallVault();
  const vk = await generateVaultKey();
  const e1 = await encryptVault(vault, vk);
  const e2 = await encryptVault(vault, vk);
  assert.deepEqual(Object.keys(e1), ['format', 'v', 'alg', 'iv', 'ct']);
  assert.deepEqual([e1.format, e1.v, e1.alg], ['keymesh', 2, 'AES-GCM-256']);
  assert.equal(b64Len(e1.iv), 12);
  assert.notEqual(e1.iv, e2.iv);
  assert.notEqual(e1.ct, e2.ct);
  assert.deepEqual(await decryptVault(e2, vk, vault.vaultId), vault);
});

test('FR09 vault meta round-trips under its own AAD', async () => {
  const vk = await generateVaultKey();
  const id = newVaultId();
  const meta = { name: 'Công việc', color: 'red', order: 2 };
  const env = await encryptVaultMeta(meta, vk, id);
  assert.deepEqual(Object.keys(env), ['iv', 'ct']);
  assert.deepEqual(await decryptVaultMeta(env, vk, id), meta);
  await assert.rejects(decryptVaultMeta(env, vk, newVaultId()), hasCode('decrypt-failed'));
});

async function everyFlipFails(env, open) {
  let tries = 0;
  for (const field of ['iv', 'ct']) {
    const n = b64Len(env[field]);
    for (let i = 0; i < n; i++) {
      await assert.rejects(open({ ...env, [field]: flipB64(env[field], i) }), hasCode('decrypt-failed'), `${field}[${i}]`);
      tries++;
    }
  }
  return tries;
}

test('AC05 FR10 flipping any single byte of iv or ct in any envelope is decrypt-failed', async () => {
  const enc = (await deriveFromPassword('flip test', newKdf())).encKey;
  const acc = await generateAccountKey();
  const { vault, vaultKey, record } = await vaultRecord(acc);
  const id = vault.vaultId;
  const wrappedAcc = await wrapAccountKey(acc, enc);

  const counts = {
    vault: await everyFlipFails(record.envelope, (e) => decryptVault(e, vaultKey, id)),
    meta: await everyFlipFails(record.meta, (e) => decryptVaultMeta(e, vaultKey, id)),
    accountKey: await everyFlipFails(wrappedAcc, (e) => unwrapAccountKey(e, enc)),
    vaultKey: await everyFlipFails(record.wrappedVaultKey, (e) => unwrapVaultKey(e, acc, id)),
  };
  assert.equal(counts.accountKey, 12 + 48);
  assert.equal(counts.vaultKey, 12 + 48);
  assert.equal(counts.vault, 12 + b64Len(record.envelope.ct));
  // Untouched envelopes still open.
  assert.deepEqual(await decryptVault(record.envelope, vaultKey, id), vault);
});

test('AC06 FR06 FR08 vault A blob or wrappedVaultKey opened under vault B id is decrypt-failed', async () => {
  const acc = await generateAccountKey();
  const a = await vaultRecord(acc);
  const b = await vaultRecord(acc);
  await assert.rejects(decryptVault(a.record.envelope, a.vaultKey, b.vault.vaultId), hasCode('decrypt-failed'));
  await assert.rejects(unwrapVaultKey(a.record.wrappedVaultKey, acc, b.vault.vaultId), hasCode('decrypt-failed'));
  // Even with B's own key, A's blob does not open as B.
  await assert.rejects(decryptVault(a.record.envelope, b.vaultKey, b.vault.vaultId), hasCode('decrypt-failed'));
});

test('AC07 FR09 a meta envelope opened as a vault envelope (same key, same id) is decrypt-failed', async () => {
  const acc = await generateAccountKey();
  const { vault, vaultKey, record } = await vaultRecord(acc);
  const disguised = { format: 'keymesh', v: 2, alg: 'AES-GCM-256', ...record.meta };
  await assert.rejects(decryptVault(disguised, vaultKey, vault.vaultId), hasCode('decrypt-failed'));
  const { iv, ct } = record.envelope;
  await assert.rejects(decryptVaultMeta({ iv, ct }, vaultKey, vault.vaultId), hasCode('decrypt-failed'));
});

test('AC08 FR11 unsupported format/v/alg/by are reported before decryption', async () => {
  const acc = await generateAccountKey();
  const { vault, record } = await vaultRecord(acc);
  const otherKey = await generateVaultKey(); // wrong key: unsupported must win over decrypt-failed
  const id = vault.vaultId;
  const e = record.envelope;
  await assert.rejects(decryptVault({ ...e, format: 'envvault' }, otherKey, id), hasCode('unsupported'));
  await assert.rejects(decryptVault({ ...e, v: 1 }, otherKey, id), hasCode('unsupported'));
  await assert.rejects(decryptVault({ ...e, alg: 'AES-CBC-256' }, otherKey, id), hasCode('unsupported'));
  await assert.rejects(unwrapVaultKey({ ...record.wrappedVaultKey, by: 'password' }, await generateAccountKey(), id), hasCode('unsupported'));
});

test('AC08 FR11 missing ct, 8-byte iv, broken base64 and truncated keys are format errors', async () => {
  const acc = await generateAccountKey();
  const { vault, vaultKey, record } = await vaultRecord(acc);
  const id = vault.vaultId;
  const { ct, ...noCt } = record.envelope;
  await assert.rejects(decryptVault(noCt, vaultKey, id), hasCode('format'));
  await assert.rejects(decryptVault({ ...record.envelope, iv: toBase64(randomBytes(8)) }, vaultKey, id), hasCode('format'));
  await assert.rejects(decryptVault({ ...record.envelope, ct: record.envelope.ct.slice(0, -2) + '*=' }, vaultKey, id), hasCode('format'));
  await assert.rejects(decryptVault({ ...record.envelope, ct: toBase64(randomBytes(10)) }, vaultKey, id), hasCode('format'));
  const { format, ...noFormat } = record.envelope;
  await assert.rejects(decryptVault(noFormat, vaultKey, id), hasCode('format'));
  await assert.rejects(decryptVault('not an envelope', vaultKey, id), hasCode('format'));
  await assert.rejects(decryptVaultMeta({ iv: record.meta.iv }, vaultKey, id), hasCode('format'));
  const short = { ...record.wrappedVaultKey, ct: toBase64(randomBytes(47)) };
  await assert.rejects(unwrapVaultKey(short, acc, id), hasCode('format'));
  const { by, ...noBy } = record.wrappedVaultKey;
  await assert.rejects(unwrapVaultKey(noBy, acc, id), hasCode('format'));
  await assert.rejects(unwrapAccountKey({ iv: 'AAAA', ct: 'AAAA' }, await deriveFromPrf(randomBytes(32))), hasCode('format'));
});

test('AC10 FR07 NFR03 10 000 encryptions of the same vault under one key never repeat an IV', async () => {
  const vault = createVault(newVaultId());
  const vk = await generateVaultKey();
  const ivs = new Set();
  for (let n = 0; n < 10000; n++) ivs.add((await encryptVault(vault, vk)).iv);
  assert.equal(ivs.size, 10000);
});

test('AC12 FR08 authentic ciphertext whose content names vault X, opened as Y, is a format error', async () => {
  const vk = await generateVaultKey();
  const x = smallVault();
  const y = newVaultId();
  const iv = randomBytes(12);
  const gz = await _internal.gzip(utf8Encode(JSON.stringify(x)));
  const ct = await _internal.sealBytes(vk, iv, gz, _internal.aadVault(y));
  const env = { format: 'keymesh', v: 2, alg: 'AES-GCM-256', iv: toBase64(iv), ct };
  await assert.rejects(decryptVault(env, vk, y), hasCode('format'));
});

test('AC13 FR12 three vaults, one tampered: the other two open, the bad one reports its vaultId', async () => {
  const acc = await generateAccountKey();
  const recs = [await vaultRecord(acc), await vaultRecord(acc), await vaultRecord(acc)];
  const records = recs.map((r) => r.record);
  records[1] = { ...records[1], envelope: { ...records[1].envelope, ct: flipB64(records[1].envelope.ct, 20) } };
  const { vaults } = await unlockWithAccountKey(acc, records);
  assert.equal(vaults.length, 3);
  assert.equal(vaults[0].ok, true);
  assert.deepEqual(vaults[0].vault, recs[0].vault);
  assert.equal(vaults[2].ok, true);
  assert.deepEqual(vaults[2].vault, recs[2].vault);
  assert.equal(vaults[1].ok, false);
  assert.equal(vaults[1].vaultId, records[1].vaultId);
  assert.equal(vaults[1].error.code, 'decrypt-failed');
  assert.equal('vault' in vaults[1], false);
});

test('FR03 scenario 3.1.4: a PRF-wrapped accountKey opens every vault like the password does', async () => {
  const a = await account;
  const prfKey = await deriveFromPrf(randomBytes(32));
  const viaPrf = await wrapAccountKey(a.accountKey, prfKey);
  const acc = await unwrapAccountKey(viaPrf, prfKey);
  const u = await unlockWithAccountKey(acc, a.records);
  assert.deepEqual(u.vaults[0].vault, a.vaults[0].vault);
});

test('FR22 missing CompressionStream or WebCrypto is unsupported, naming the API', async () => {
  const vk = await generateVaultKey();
  const vault = createVault(newVaultId());
  await withGlobal('CompressionStream', undefined, async () => {
    await assert.rejects(encryptVault(vault, vk), (e) => hasCode('unsupported')(e) && /CompressionStream/.test(e.message));
  });
  await withGlobal('crypto', undefined, async () => {
    assert.throws(() => newVaultId(), (e) => hasCode('unsupported')(e) && /crypto\.subtle/.test(e.message));
    await assert.rejects(deriveFromPassword('pw', { name: 'PBKDF2-SHA256', iter: 600000, salt: 'AAECAwQFBgcICQoLDA0ODw==' }), hasCode('unsupported'));
  });
  // Restored afterwards.
  assert.equal(typeof globalThis.crypto.subtle.encrypt, 'function');
  assert.equal(typeof globalThis.CompressionStream, 'function');
});
