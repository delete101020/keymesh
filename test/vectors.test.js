import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFromPassword,
  deriveFromPrf,
  unwrapAccountKey,
  unwrapVaultKey,
  decryptVault,
  decryptVaultMeta,
  unlockWithPassword,
  _internal,
} from '../src/public/js/core/crypto.js';
import { fromBase64, toHex, utf8Encode } from '../src/public/js/core/bytes.js';
import { VECTORS as V } from '../testkit/vectors.js';

const I = V.inputs;
const iv = (k) => fromBase64(I.iv[k]);
const keys = (async () => ({
  derived: await deriveFromPassword(I.password, I.kdf),
  prfKey: await deriveFromPrf(fromBase64(I.prf)),
  accountKey: await _internal.importKey(fromBase64(I.accountKey), 'account'),
  vaultKey: await _internal.importKey(fromBase64(I.vaultKey), 'vault'),
}))();

test('AC02 AC24 NFR08 authKey from the fixed password and salt matches the vector', async () => {
  const { derived } = await keys;
  assert.equal(toHex(derived.authKey), V.authKey);
});

test('AC24 NFR08 encKey: accountKey wrapped with the fixed IV matches, and the vector unwraps', async () => {
  const { derived, accountKey } = await keys;
  assert.deepEqual(await _internal.sealAccountKey(accountKey, derived.encKey, iv('accountKeyByEnc')), V.wrappedAccountKeyByEnc);
  const opened = await unwrapAccountKey(V.wrappedAccountKeyByEnc, derived.encKey);
  assert.deepEqual(await _internal.sealAccountKey(opened, derived.encKey, iv('accountKeyByEnc')), V.wrappedAccountKeyByEnc);
});

test('AC24 NFR08 prfKey: accountKey wrapped with the fixed IV matches, and the vector unwraps', async () => {
  const { prfKey, accountKey } = await keys;
  assert.deepEqual(await _internal.sealAccountKey(accountKey, prfKey, iv('accountKeyByPrf')), V.wrappedAccountKeyByPrf);
  await unwrapAccountKey(V.wrappedAccountKeyByPrf, prfKey);
});

test('AC24 NFR08 wrappedVaultKey with the fixed IV matches, and the vector unwraps', async () => {
  const { accountKey, vaultKey } = await keys;
  assert.deepEqual(await _internal.sealVaultKey(vaultKey, accountKey, I.vaultId, iv('vaultKey')), V.wrappedVaultKey);
  const opened = await unwrapVaultKey(V.wrappedVaultKey, accountKey, I.vaultId);
  assert.deepEqual(await _internal.sealVaultKey(opened, accountKey, I.vaultId, iv('vaultKey')), V.wrappedVaultKey);
});

test('AC24 NFR08 vault meta with the fixed IV matches, and the vector decrypts', async () => {
  const { vaultKey } = await keys;
  assert.deepEqual(await _internal.sealVaultMeta(I.meta, vaultKey, I.vaultId, iv('meta')), V.meta);
  assert.deepEqual(await decryptVaultMeta(V.meta, vaultKey, I.vaultId), I.meta);
});

test('AC24 NFR08 vault envelope: the vector decrypts to the vault; AES-GCM over the fixed gzip gives its ct', async () => {
  const { vaultKey } = await keys;
  assert.deepEqual(await decryptVault(V.envelope, vaultKey, I.vaultId), I.vault);
  const gz = fromBase64(V.vaultGzip);
  assert.deepEqual(await _internal.gunzip(gz), utf8Encode(JSON.stringify(I.vault)));
  assert.equal(await _internal.sealBytes(vaultKey, iv('vault'), gz, _internal.aadVault(I.vaultId)), V.envelope.ct);
  const env = await _internal.sealVault(I.vault, vaultKey, iv('vault'));
  assert.deepEqual(Object.keys(env), Object.keys(V.envelope));
  assert.deepEqual(await decryptVault(env, vaultKey, I.vaultId), I.vault);
});

test('AC24 FR12 the whole chain opens the vector vault from the password alone', async () => {
  const record = { vaultId: I.vaultId, wrappedVaultKey: V.wrappedVaultKey, meta: V.meta, envelope: V.envelope };
  const { vaults } = await unlockWithPassword(I.password, I.kdf, V.wrappedAccountKeyByEnc, [record]);
  assert.equal(vaults[0].ok, true);
  assert.deepEqual(vaults[0].vault, I.vault);
  assert.deepEqual(vaults[0].meta, I.meta);
});
