import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordStrength, STRENGTH_LABELS } from '../src/public/js/password-strength.js';

test('KM-006 AC02 FR02 abc, 12, 14 characters and 14 of 2 distinct: weak, fair, strong, weak', () => {
  assert.deepEqual(['abc', 'abcdefghijkl', 'abcdefghijklmn', 'ab'.repeat(7)].map(passwordStrength), ['weak', 'fair', 'strong', 'weak']);
  assert.equal(passwordStrength('aaaaaaaaaaaaab'), 'weak');
  assert.equal(passwordStrength(''), null);
  assert.deepEqual(Object.values(STRENGTH_LABELS), ['Yếu', 'Khá', 'Mạnh']);
});

test('KM-006 FR02 counted after NFC: a decomposed letter is one character', () => {
  const nfd = 'ệ'.normalize('NFD');
  assert.equal(passwordStrength(`${nfd}bcdefghijk`), 'weak'); // 11 after NFC, 12 code points before
  assert.equal(passwordStrength(`${nfd}bcdefghijkl`), 'fair');
});
