import { KeymeshError } from './errors.js';

const KEY_BITS = 256;
const IV_LEN = 12;
const TAG_LEN = 16;
const EMPTY = new Uint8Array(0);

// Looked up on every call (never cached) so a missing API is reported where it is needed.
function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new KeymeshError('unsupported', 'crypto.subtle');
  return s;
}

export function assertSupported() {
  if (!globalThis.crypto?.subtle) throw new KeymeshError('unsupported', 'crypto.subtle');
  if (typeof globalThis.crypto.getRandomValues !== 'function') throw new KeymeshError('unsupported', 'crypto.getRandomValues');
  if (typeof globalThis.CompressionStream !== 'function') throw new KeymeshError('unsupported', 'CompressionStream');
  if (typeof globalThis.DecompressionStream !== 'function') throw new KeymeshError('unsupported', 'DecompressionStream');
  if (typeof globalThis.TextEncoder !== 'function') throw new KeymeshError('unsupported', 'TextEncoder');
  if (typeof globalThis.TextDecoder !== 'function') throw new KeymeshError('unsupported', 'TextDecoder');
}

// --- primitives ---------------------------------------------------------------------------------

async function pbkdf2(passwordBytes, salt, iterations, bits = KEY_BITS) {
  const base = await subtle().importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, bits));
}

async function hkdfBits(ikm, salt, info, bits = KEY_BITS) {
  const base = ikm instanceof Uint8Array ? await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']) : ikm;
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, base, bits));
}

async function aesKey(raw, usages = ['encrypt', 'decrypt'], extractable = false) {
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, extractable, usages);
}

async function aesEncrypt(key, iv, plaintext, aad) {
  const params = { name: 'AES-GCM', iv, tagLength: TAG_LEN * 8 };
  if (aad) params.additionalData = aad;
  return new Uint8Array(await subtle().encrypt(params, key, plaintext));
}

// Any failure collapses into one error with no cause attached: wrong key, wrong AAD and tampering look alike.
async function aesDecrypt(key, iv, ciphertext, aad) {
  const params = { name: 'AES-GCM', iv, tagLength: TAG_LEN * 8 };
  if (aad) params.additionalData = aad;
  try {
    return new Uint8Array(await subtle().decrypt(params, key, ciphertext));
  } catch {
    throw new KeymeshError('decrypt-failed');
  }
}

async function pipeBytes(bytes, transform) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
}

async function gzip(bytes) {
  if (typeof globalThis.CompressionStream !== 'function') throw new KeymeshError('unsupported', 'CompressionStream');
  return pipeBytes(bytes, new CompressionStream('gzip'));
}

async function gunzip(bytes) {
  if (typeof globalThis.DecompressionStream !== 'function') throw new KeymeshError('unsupported', 'DecompressionStream');
  try {
    return await pipeBytes(bytes, new DecompressionStream('gzip'));
  } catch {
    throw new KeymeshError('format', 'gzip');
  }
}

// Test-only access to the building blocks (KATs, fixed-IV vectors). Not part of the contract in docs/09.
export const _internal = Object.freeze({
  pbkdf2,
  hkdfBits,
  aesKey,
  aesEncrypt,
  aesDecrypt,
  gzip,
  gunzip,
  IV_LEN,
  TAG_LEN,
  EMPTY,
});
