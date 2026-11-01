import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRandom, generateWords, LOWER, UPPER, DIGITS, SYMBOLS } from '../src/public/js/passgen.js';
import { WORDS } from '../src/public/js/wordlist.js';

const has = (s, set) => [...s].some((c) => set.includes(c));

test('KM-003 AC27 FR31 10 000 values × 8 option sets × lengths 8 and 64: right length and groups, no repeats', () => {
  for (const length of [8, 64]) {
    for (let mask = 0; mask < 8; mask++) {
      const opts = { length, upper: !!(mask & 1), digits: !!(mask & 2), symbols: !!(mask & 4) };
      const seen = new Set();
      for (let n = 0; n < 10000; n++) {
        const s = generateRandom(opts);
        assert.equal(s.length, length);
        assert.ok(has(s, LOWER));
        assert.equal(has(s, UPPER), opts.upper || false);
        assert.equal(has(s, DIGITS), opts.digits || false);
        assert.equal(has(s, SYMBOLS), opts.symbols || false);
        seen.add(s);
      }
      assert.equal(seen.size, 10000);
    }
  }
});

test('KM-003 FR31 length is clamped to 8–64 and defaults to 24', () => {
  assert.equal(generateRandom().length, 24);
  assert.equal(generateRandom({ length: 2 }).length, 8);
  assert.equal(generateRandom({ length: 999 }).length, 64);
});

test('KM-003 FR31 characters are not biased: each letter stays within 15% of the expected count', () => {
  const counts = new Map();
  const N = 2000;
  for (let n = 0; n < N; n++) for (const c of generateRandom({ length: 64, upper: false, digits: false, symbols: false })) counts.set(c, (counts.get(c) ?? 0) + 1);
  const expected = (N * 64) / 26;
  assert.equal(counts.size, 26);
  for (const v of counts.values()) assert.ok(Math.abs(v - expected) / expected < 0.15);
});

test('KM-003 AC28 FR32 word list: at least 2048 distinct entries, no separator inside a word', () => {
  assert.equal(WORDS.length, 7772);
  assert.equal(new Set(WORDS).size, WORDS.length);
  assert.ok(WORDS.every((w) => /^[a-z]+$/.test(w)));
});

test('KM-003 AC28 FR32 default is 5 words (≥ 55 bits), adjustable 3–8', () => {
  assert.equal(generateWords().split('-').length, 5);
  assert.ok(5 * Math.log2(WORDS.length) >= 55);
  for (const count of [3, 8]) assert.equal(generateWords({ count }).split('-').length, count);
  assert.equal(generateWords({ count: 1 }).split('-').length, 3);
  assert.equal(generateWords({ count: 99 }).split('-').length, 8);
  assert.ok(generateWords().split('-').every((w) => WORDS.includes(w)));
});
