import test from 'node:test';
import assert from 'node:assert/strict';
import { toBase64, fromBase64, toHex, fromHex, utf8Encode, utf8Decode, randomBytes } from '../src/public/js/core/bytes.js';
import { KeymeshError } from '../src/public/js/core/errors.js';

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
