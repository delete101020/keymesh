import { KeymeshError } from './errors.js';

const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const HEX_RE = /^(?:[0-9a-f]{2})*$/;
const CHUNK = 0x8000;

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

// Strict: standard alphabet, mandatory padding, no whitespace, zero padding bits.
export function fromBase64(str, field = 'base64') {
  if (typeof str !== 'string' || !B64_RE.test(str)) throw new KeymeshError('format', field);
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (toBase64(out) !== str) throw new KeymeshError('format', field);
  return out;
}

export function toHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(str, field = 'hex') {
  if (typeof str !== 'string' || !HEX_RE.test(str)) throw new KeymeshError('format', field);
  const out = new Uint8Array(str.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(str.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function utf8Encode(str) {
  return new TextEncoder().encode(str);
}

export function utf8Decode(bytes, field = 'utf8') {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new KeymeshError('format', field);
  }
}

// getRandomValues caps a single call at 65 536 bytes.
export function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}

export function zeroize(bytes) {
  if (bytes) bytes.fill(0);
}
