import test from 'node:test';
import assert from 'node:assert/strict';
import { toBase64, fromBase64, toHex, fromHex, utf8Encode, utf8Decode, randomBytes } from '../src/public/js/core/bytes.js';
import { KeymeshError } from '../src/public/js/core/errors.js';
import { _internal as c, assertSupported } from '../src/public/js/core/crypto.js';

const isFormat = (e) => e instanceof KeymeshError && e.code === 'format';

test('bytes: base64 round-trip, including lengths 0–5 and 100 KB', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 100_000]) {
    const b = randomBytes(n);
    assert.deepEqual(fromBase64(toBase64(b)), b);
  }
  assert.equal(toBase64(utf8Encode('foobar')), 'Zm9vYmFy');
  assert.equal(toBase64(utf8Encode('fo')), 'Zm8=');
});

test('bytes: strict base64 rejects bad alphabet, padding, whitespace and non-zero pad bits (AC08)', () => {
  for (const bad of ['Zm9v YmFy', 'Zm8', 'Zm8==', 'Zm9vYmFy\n', 'Zm-_', 'Zm9=', '====', 'Zn==', 42, null]) {
    assert.throws(() => fromBase64(bad), isFormat);
  }
});

test('bytes: hex round-trip and strict parsing', () => {
  assert.equal(toHex(new Uint8Array([0, 15, 255])), '000fff');
  assert.deepEqual(fromHex('000fff'), new Uint8Array([0, 15, 255]));
  for (const bad of ['0', 'zz', '00FF', ' 00']) assert.throws(() => fromHex(bad), isFormat);
});

test('bytes: UTF-8 with Vietnamese and emoji; invalid UTF-8 is a format error', () => {
  const s = 'Mật khẩu 🔐 đã đổi';
  assert.equal(utf8Decode(utf8Encode(s)), s);
  assert.throws(() => utf8Decode(new Uint8Array([0xc3, 0x28])), isFormat);
});

test('bytes: randomBytes beyond the 64 KB getRandomValues limit', () => {
  const b = randomBytes(200_000);
  assert.equal(b.length, 200_000);
  assert.ok(b.subarray(150_000).some((x) => x !== 0));
});

// --- Known-answer tests (AC01, NFR10). Hex cross-checked against node:crypto when written. ---

const hex = (s) => fromHex(s);
const range = (a, b) => Uint8Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('AC01 HKDF-SHA256: RFC 5869 Test Case 1', async () => {
  const okm = await c.hkdfBits(new Uint8Array(22).fill(0x0b), range(0x00, 0x0c), range(0xf0, 0xf9), 42 * 8);
  assert.equal(toHex(okm), '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
});

test('AC01 HKDF-SHA256: RFC 5869 Test Case 2 (long inputs)', async () => {
  const okm = await c.hkdfBits(range(0x00, 0x4f), range(0x60, 0xaf), range(0xb0, 0xff), 82 * 8);
  assert.equal(
    toHex(okm),
    'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87',
  );
});

test('AC01 HKDF-SHA256: RFC 5869 Test Case 3 (empty salt and info, as keymesh uses)', async () => {
  const okm = await c.hkdfBits(new Uint8Array(22).fill(0x0b), c.EMPTY, c.EMPTY, 42 * 8);
  assert.equal(toHex(okm), '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8');
});

test('AC01 PBKDF2-HMAC-SHA256: RFC 7914 §11 (c = 1 and c = 80 000)', async () => {
  const a = await c.pbkdf2(utf8Encode('passwd'), utf8Encode('salt'), 1, 512);
  assert.equal(
    toHex(a),
    '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783',
  );
  const b = await c.pbkdf2(utf8Encode('Password'), utf8Encode('NaCl'), 80000, 512);
  assert.equal(
    toHex(b),
    '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d',
  );
});

const GCM_K = 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308';
const GCM_IV = 'cafebabefacedbaddecaf888';
const GCM_P =
  'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255';
const GCM_C =
  '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad';
const GCM_CASES = [
  { tc: 13, k: '00'.repeat(32), iv: '00'.repeat(12), p: '', aad: null, out: '530f8afbc74536b9a963b4f1c4cb738b' },
  { tc: 14, k: '00'.repeat(32), iv: '00'.repeat(12), p: '00'.repeat(16), aad: null, out: 'cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919' },
  { tc: 15, k: GCM_K, iv: GCM_IV, p: GCM_P, aad: null, out: GCM_C + 'b094dac5d93471bdec1a502270e3cc6c' },
  { tc: 16, k: GCM_K, iv: GCM_IV, p: GCM_P.slice(0, 120), aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2', out: GCM_C.slice(0, 120) + '76fc6ece0f4e1768cddf8853bb2d551b' },
];

test('AC01 AES-GCM-256: McGrew–Viega Test Cases 13–16 (TC16 with AAD), encrypt and decrypt', async () => {
  for (const v of GCM_CASES) {
    const key = await c.aesKey(hex(v.k));
    const aad = v.aad ? hex(v.aad) : undefined;
    const ct = await c.aesEncrypt(key, hex(v.iv), hex(v.p), aad);
    assert.equal(toHex(ct), v.out, `TC${v.tc} encrypt`);
    assert.equal(toHex(await c.aesDecrypt(key, hex(v.iv), ct, aad)), v.p, `TC${v.tc} decrypt`);
  }
});

test('AC01 AES-GCM-256: TC16 with a wrong AAD is decrypt-failed', async () => {
  const v = GCM_CASES[3];
  const key = await c.aesKey(hex(v.k));
  await assert.rejects(
    c.aesDecrypt(key, hex(v.iv), hex(v.out), hex('00' + v.aad.slice(2))),
    (e) => e instanceof KeymeshError && e.code === 'decrypt-failed',
  );
});

test('gzip round-trip and corrupt gzip is a format error', async () => {
  const data = utf8Encode('Mật khẩu 🔐 '.repeat(5000));
  const gz = await c.gzip(data);
  assert.ok(gz.length < data.length);
  assert.deepEqual(await c.gunzip(gz), data);
  await assert.rejects(c.gunzip(utf8Encode('not gzip at all')), isFormat);
});

test('assertSupported passes on this platform', () => {
  assertSupported();
});
