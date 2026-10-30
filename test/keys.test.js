import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newKdf,
  deriveFromPassword,
  deriveFromPrf,
  generateAccountKey,
  generateVaultKey,
  wrapAccountKey,
  unwrapAccountKey,
  wrapVaultKey,
  unwrapVaultKey,
  newVaultId,
  KDF_MIN_ITER,
  _internal,
} from '../src/public/js/core/crypto.js';
import { fromBase64, toHex, randomBytes } from '../src/public/js/core/bytes.js';
import { derive, hasCode, b64Len } from '../testkit/helpers.js';

const KDF = { name: 'PBKDF2-SHA256', iter: KDF_MIN_ITER, salt: 'AAECAwQFBgcICQoLDA0ODw==' };
const IV = new Uint8Array(12).fill(7);

// Two handles are the same key iff they wrap a fixed key to the same bytes under a fixed IV.
async function sameKey(a, b) {
  const enc = (await derive('fingerprint', KDF)).encKey;
  const x = await _internal.sealAccountKey(a, enc, IV);
  const y = await _internal.sealAccountKey(b, enc, IV);
  return x.ct === y.ct;
}

test('FR01 newKdf: PBKDF2-SHA256, 600 000 iterations, fresh 16-byte salt', () => {
  const a = newKdf();
  const b = newKdf();
  assert.equal(a.name, 'PBKDF2-SHA256');
  assert.equal(a.iter, 600000);
  assert.equal(fromBase64(a.salt).length, 16);
  assert.notEqual(a.salt, b.salt);
});

test('AC02 FR02 deriving twice gives the same authKey; encKey and authKey differ', async () => {
  const a = await deriveFromPassword('correct horse', KDF);
  const b = await deriveFromPassword('correct horse', KDF);
  assert.ok(a.authKey instanceof Uint8Array);
  assert.equal(a.authKey.length, 32);
  assert.equal(toHex(a.authKey), toHex(b.authKey));
  const c = await deriveFromPassword('correct horse', { ...KDF, salt: 'AQECAwQFBgcICQoLDA0ODw==' });
  assert.notEqual(toHex(a.authKey), toHex(c.authKey));
  // encKey is a different key from authKey: wrapping with encKey is not reproducible from authKey bytes.
  const acc = await generateAccountKey();
  const viaEnc = await _internal.sealAccountKey(acc, a.encKey, IV);
  const asEnc = await _internal.importKey(a.authKey, 'enc');
  const viaAuth = await _internal.sealAccountKey(acc, asEnc, IV);
  assert.notEqual(viaEnc.ct, viaAuth.ct);
  assert.equal(viaEnc.ct, (await _internal.sealAccountKey(acc, b.encKey, IV)).ct);
});

test('AC03 FR01 iter = 599999 or name = Argon2id is unsupported before PBKDF2 runs', async () => {
  const subtle = globalThis.crypto.subtle;
  let calls = 0;
  const original = subtle.deriveBits;
  subtle.deriveBits = function (...args) {
    calls++;
    return original.apply(this, args);
  };
  try {
    await assert.rejects(deriveFromPassword('pw', { ...KDF, iter: 599999 }), hasCode('unsupported'));
    await assert.rejects(deriveFromPassword('pw', { ...KDF, name: 'Argon2id' }), hasCode('unsupported'));
    assert.equal(calls, 0);
    await deriveFromPassword('pw', KDF);
    assert.ok(calls > 0, 'spy must see a real derivation');
  } finally {
    delete subtle.deriveBits;
  }
});

test('FR01 malformed kdf is a format error', async () => {
  await assert.rejects(deriveFromPassword('pw', null), hasCode('format'));
  await assert.rejects(deriveFromPassword('pw', { ...KDF, iter: '600000' }), hasCode('format'));
  await assert.rejects(deriveFromPassword('pw', { ...KDF, salt: 'AAEC' }), hasCode('format'));
  await assert.rejects(deriveFromPassword('pw', { ...KDF, salt: 'not base64!' }), hasCode('format'));
  await assert.rejects(deriveFromPassword(42, KDF), hasCode('invalid'));
});

test('FR04 newVaultId is 16 lowercase hex and random', () => {
  const ids = new Set(Array.from({ length: 1000 }, newVaultId));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{16}$/);
});

test('FR05 wrapped accountKey is { iv: 12B, ct: 48B } with a fresh IV each time', async () => {
  const { encKey } = await derive('correct horse', KDF);
  const acc = await generateAccountKey();
  const w1 = await wrapAccountKey(acc, encKey);
  const w2 = await wrapAccountKey(acc, encKey);
  assert.deepEqual(Object.keys(w1).sort(), ['ct', 'iv']);
  assert.equal(b64Len(w1.iv), 12);
  assert.equal(b64Len(w1.ct), 48);
  assert.notEqual(w1.iv, w2.iv);
  assert.ok(await sameKey(await unwrapAccountKey(w1, encKey), acc));
});

test('AC04 FR10 wrong password cannot open the accountKey: decrypt-failed', async () => {
  const right = await derive('correct horse', KDF);
  const wrong = await derive('correct horsf', KDF);
  const wrapped = await wrapAccountKey(await generateAccountKey(), right.encKey);
  await assert.rejects(unwrapAccountKey(wrapped, wrong.encKey), hasCode('decrypt-failed'));
});

test('AC09 FR03 FR05 one accountKey wrapped under P1, P2 and a PRF key opens the same vault', async () => {
  const p1 = await derive('password one', KDF);
  const p2 = await derive('password two', { ...KDF, salt: 'DwECAwQFBgcICQoLDA0ODw==' });
  const prfKey = await deriveFromPrf(randomBytes(32));
  const acc = await generateAccountKey();
  const vaultId = newVaultId();
  const vaultKey = await generateVaultKey();
  const wrappedVaultKey = await wrapVaultKey(vaultKey, acc, vaultId);

  const opened = [];
  for (const k of [p1.encKey, p2.encKey, prfKey]) {
    const accN = await unwrapAccountKey(await wrapAccountKey(acc, k), k);
    assert.ok(await sameKey(accN, acc));
    opened.push(await unwrapVaultKey(wrappedVaultKey, accN, vaultId));
  }
  // The three unwrapped vault keys are the original key.
  const fixedAcc = await _internal.importKey(new Uint8Array(32).fill(1), 'account');
  const fp = async (vk) => (await _internal.sealVaultKey(vk, fixedAcc, vaultId, IV)).ct;
  for (const vk of opened) assert.equal(await fp(vk), await fp(vaultKey));
});

test('FR03 deriveFromPrf needs exactly 32 bytes; same PRF gives the same prfKey', async () => {
  await assert.rejects(deriveFromPrf(new Uint8Array(31)), hasCode('invalid'));
  await assert.rejects(deriveFromPrf('x'.repeat(32)), hasCode('invalid'));
  const prf = randomBytes(32);
  const a = await deriveFromPrf(prf);
  const b = await deriveFromPrf(prf);
  const acc = await generateAccountKey();
  assert.equal((await _internal.sealAccountKey(acc, a, IV)).ct, (await _internal.sealAccountKey(acc, b, IV)).ct);
});

test('FR06 wrapped vaultKey is { by: "account", iv, ct: 48B }; wrong accountKey is decrypt-failed', async () => {
  const acc = await generateAccountKey();
  const vaultId = newVaultId();
  const w = await wrapVaultKey(await generateVaultKey(), acc, vaultId);
  assert.equal(w.by, 'account');
  assert.equal(b64Len(w.iv), 12);
  assert.equal(b64Len(w.ct), 48);
  await assert.rejects(unwrapVaultKey(w, await generateAccountKey(), vaultId), hasCode('decrypt-failed'));
  await assert.rejects(wrapVaultKey(await generateVaultKey(), acc, 'v_0123456789abcdef'), hasCode('invalid'));
});

test('NFR05 key handles expose no key bytes and cannot be swapped between roles', async () => {
  const { encKey } = await derive('correct horse', KDF);
  const handles = [encKey, await deriveFromPrf(randomBytes(32)), await generateAccountKey(), await generateVaultKey()];
  for (const h of handles) {
    assert.deepEqual(Object.keys(h), []);
    assert.deepEqual(Object.getOwnPropertyNames(h), []);
    assert.equal(JSON.stringify(h), '{}');
    assert.equal(Object.getOwnPropertySymbols(h).length, 0);
  }
  const [enc, , acc, vk] = handles;
  await assert.rejects(wrapAccountKey(vk, enc), hasCode('invalid'));
  await assert.rejects(wrapAccountKey(acc, vk), hasCode('invalid'));
  await assert.rejects(wrapVaultKey(acc, acc, newVaultId()), hasCode('invalid'));
  await assert.rejects(wrapAccountKey({}, enc), hasCode('invalid'));
});
