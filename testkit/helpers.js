// Shared test helpers. Runs unchanged on Node and in the browser runner.
import { deriveFromPassword } from '../src/public/js/core/crypto.js';
import { KeymeshError } from '../src/public/js/core/errors.js';
import { fromBase64, toBase64 } from '../src/public/js/core/bytes.js';

export const isNode = typeof globalThis.process?.versions?.node === 'string';

export const T0 = 1761600000000;
export const DEV_A = 'd_aaaaaaaaaaaaaaaa';
export const DEV_B = 'd_bbbbbbbbbbbbbbbb';
export const ctx = (now = T0, deviceId = DEV_A) => ({ now, deviceId });

// PBKDF2 600k costs ~100 ms; derive each (password, kdf) once per test file.
const derived = new Map();
export function derive(password, kdf) {
  const k = `${password}\u0000${kdf.name}\u0000${kdf.iter}\u0000${kdf.salt}`;
  if (!derived.has(k)) derived.set(k, deriveFromPassword(password, kdf));
  return derived.get(k);
}

export const hasCode = (code) => (e) => e instanceof KeymeshError && e.code === code;

// Flip one bit of byte `i` in a base64 field.
export function flipB64(b64, i) {
  const b = fromBase64(b64);
  b[i] ^= 0x01;
  return toBase64(b);
}

export function b64Len(b64) {
  return fromBase64(b64).length;
}

// Source text of a core module, for static checks (FR22).
export async function readCoreSource(name) {
  if (isNode) {
    const { readFile } = await import('node:fs/promises');
    return readFile(new URL(`../src/public/js/core/${name}`, import.meta.url), 'utf8');
  }
  return (await fetch(new URL(`../src/public/js/core/${name}`, import.meta.url))).text();
}

// Temporarily replace a global (e.g. crypto, CompressionStream) for the duration of `fn`.
export async function withGlobal(name, value, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    return await fn();
  } finally {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete globalThis[name];
  }
}
