// Shared test helpers. Runs unchanged on Node and in the browser runner.
import { deriveFromPassword } from '../src/public/js/core/crypto.js';
import { KeymeshError } from '../src/public/js/core/errors.js';
import { fromBase64, toBase64, toHex, randomBytes } from '../src/public/js/core/bytes.js';
import { createVault, addProject, addEnv, createItem } from '../src/public/js/core/model.js';

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

// A vault whose JSON is at least `bytes` long, filled with random hex so gzip cannot shrink it away.
export function bigVault(vaultId, bytes) {
  const vault = createVault(vaultId);
  const p = addProject(vault, { name: 'Load' }, ctx());
  const env = addEnv(vault, p.id, { name: 'uat' }, ctx());
  let n = 0;
  while (JSON.stringify(vault).length < bytes) {
    const item = createItem(vault, 'db', { title: `Database ${n++}`, scopes: [env.id], notes: toHex(randomBytes(256)) }, ctx());
    for (const f of item.fields) f.v = toHex(randomBytes(64));
  }
  return vault;
}

// Text of a file relative to the repo root, for static checks (FR22, FR23).
export async function readRepoFile(path) {
  const url = new URL(`../${path}`, import.meta.url);
  if (isNode) {
    const { readFile } = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  return (await fetch(url)).text();
}

export const readCoreSource = (name) => readRepoFile(`src/public/js/core/${name}`);

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
