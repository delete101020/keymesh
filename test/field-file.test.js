import test from 'node:test';
import assert from 'node:assert/strict';
import { readFieldFile, fieldFileBytes, formatSize, FILE_MAX_BYTES } from '../src/public/js/field-file.js';

test('KM-003 AC34 FR38 FR39 exactly 65 536 bytes with CRLF is accepted and comes back byte for byte', () => {
  assert.equal(FILE_MAX_BYTES, 65536);
  const bytes = new Uint8Array(65536).fill(0x61);
  bytes.set([0x0d, 0x0a], 100);
  bytes.set([0xef, 0xbb, 0xbf], 0); // A BOM must survive too.
  bytes.set([0xc3, 0xa9], 200);
  const r = readFieldFile(bytes, 'client.ovpn');
  assert.equal(r.ok, true);
  assert.equal(r.file, 'client.ovpn');
  assert.deepEqual(fieldFileBytes(r.text), bytes);
});

test('KM-003 AC34 FR38 65 537 bytes, a NUL byte and invalid UTF-8 are refused', () => {
  assert.deepEqual(readFieldFile(new Uint8Array(65537).fill(0x61), 'x'), { ok: false, reason: 'too-large' });
  assert.deepEqual(readFieldFile(new Uint8Array([0x61, 0x00, 0x62]), 'x'), { ok: false, reason: 'binary' });
  assert.deepEqual(readFieldFile(new Uint8Array([0x61, 0xff, 0x62]), 'x'), { ok: false, reason: 'encoding' });
});

test('KM-003 FR39 sizes read as B and KB; a nameless file still gets a name', () => {
  assert.equal(formatSize(1023), '1023 B');
  assert.equal(formatSize(2048), '2.0 KB');
  assert.equal(readFieldFile(new Uint8Array([0x61]), '').file, 'file.txt');
});
