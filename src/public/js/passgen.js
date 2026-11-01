import { randomBytes } from './core/bytes.js';
import { WORDS } from './wordlist.js';

export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const SYMBOLS = '!@#$%^&*-_=+?';
export const LENGTH_MIN = 8;
export const LENGTH_MAX = 64;
export const LENGTH_DEFAULT = 24;
export const WORDS_MIN = 3;
export const WORDS_MAX = 8;
export const WORDS_DEFAULT = 5;
export const SEPARATOR = '-';

// Uniform index in [0, n) by rejection sampling on 16-bit draws, so no value is favoured.
function randomIndex(n) {
  const limit = 65536 - (65536 % n);
  for (;;) {
    const b = randomBytes(2);
    const x = b[0] * 256 + b[1];
    if (x < limit) return x % n;
  }
}

function pick(alphabet, length) {
  const out = new Array(length);
  for (let i = 0; i < length; i++) out[i] = alphabet[randomIndex(alphabet.length)];
  return out.join('');
}

// Redraws the whole string until every chosen group appears: placing one character of each group
// first would make those positions predictable and skew the distribution.
export function generateRandom({ length = LENGTH_DEFAULT, upper = true, digits = true, symbols = true } = {}) {
  const n = Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, Math.trunc(length)));
  const groups = [LOWER, upper && UPPER, digits && DIGITS, symbols && SYMBOLS].filter(Boolean);
  const alphabet = groups.join('');
  for (;;) {
    const s = pick(alphabet, n);
    if (groups.every((g) => [...s].some((c) => g.includes(c)))) return s;
  }
}

export function generateWords({ count = WORDS_DEFAULT } = {}) {
  const n = Math.min(WORDS_MAX, Math.max(WORDS_MIN, Math.trunc(count)));
  return Array.from({ length: n }, () => WORDS[randomIndex(WORDS.length)]).join(SEPARATOR);
}
