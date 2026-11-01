import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOtp, totp, secondsLeft, isTotpUri } from '../src/public/js/otp.js';

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(text) {
  let bits = '';
  for (const b of new TextEncoder().encode(text)) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

// RFC 6238 Appendix B.
const SEEDS = { SHA1: '12345678901234567890', SHA256: '12345678901234567890123456789012', SHA512: '1234567890123456789012345678901234567890123456789012345678901234' };
const RFC = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

test('KM-003 AC29 FR34 RFC 6238 vectors for SHA1, SHA256, SHA512', async () => {
  for (const [time, sha1, sha256, sha512] of RFC) {
    for (const [alg, want] of [['SHA1', sha1], ['SHA256', sha256], ['SHA512', sha512]]) {
      const r = parseOtp(`otpauth://totp/x?secret=${base32(SEEDS[alg])}&digits=8&period=30&algorithm=${alg}`);
      assert.equal(r.ok, true);
      assert.equal(await totp(r, time * 1000), want);
    }
  }
});

test('KM-003 AC29 FR33 URI parameters are honoured; defaults are 6 digits, 30 s, SHA1', async () => {
  const r = parseOtp(`otpauth://totp/Acme:me?secret=${base32(SEEDS.SHA1)}&digits=8&period=60`);
  assert.equal(r.digits, 8);
  assert.equal(r.period, 60);
  assert.equal((await totp(r, 60_000)).length, 8);
  const d = parseOtp('JBSWY3DPEHPK3PXP');
  assert.deepEqual([d.digits, d.period, d.algorithm], [6, 30, 'SHA-1']);
  assert.equal((await totp(d, 0)).length, 6);
  assert.equal(secondsLeft(d, 29_000), 1);
  assert.equal(secondsLeft(d, 30_000), 30);
});

test('KM-003 AC29 FR33 base32 ignores case and spaces', () => {
  const r = parseOtp('JBSW Y3dp');
  assert.equal(r.ok, true);
  assert.deepEqual(r.secret, parseOtp('JBSWY3DP').secret);
  assert.deepEqual(r.secret, new TextEncoder().encode('Hello'));
});

test('KM-003 AC30 FR33 hotp, bad base32, out-of-range parameters and empty values are refused', () => {
  const S = 'JBSWY3DP';
  const cases = [
    ['otpauth://hotp/x?secret=' + S + '&counter=1', 'hotp'],
    ['not base32!', 'base32'],
    ['ABC', 'base32'],
    [`otpauth://totp/x?secret=${S}&digits=9`, 'digits'],
    [`otpauth://totp/x?secret=${S}&digits=5`, 'digits'],
    [`otpauth://totp/x?secret=${S}&period=0`, 'period'],
    [`otpauth://totp/x?secret=${S}&period=301`, 'period'],
    [`otpauth://totp/x?secret=${S}&algorithm=MD5`, 'algorithm'],
    ['otpauth://totp/x', 'base32'],
    ['otpauth://other/x?secret=' + S, 'uri'],
    ['', 'empty'],
    ['   ', 'empty'],
  ];
  for (const [input, reason] of cases) assert.deepEqual(parseOtp(input), { ok: false, reason }, input);
});

test('KM-003 AC30 parameter edges 6–8 digits and 1–300 s are accepted', () => {
  for (const q of ['digits=6', 'digits=8', 'period=1', 'period=300', 'algorithm=sha256']) {
    assert.equal(parseOtp(`otpauth://totp/x?secret=JBSWY3DP&${q}`).ok, true, q);
  }
  assert.equal(isTotpUri('otpauth://totp/x'), true);
  assert.equal(isTotpUri('otpauth://hotp/x'), false);
});
