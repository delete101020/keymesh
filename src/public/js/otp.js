// TOTP (RFC 6238) on WebCrypto. `v` of an otp field is a base32 secret or an otpauth://totp/ URI.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ALGORITHMS = Object.freeze({ SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' });
// A base32 string of these lengths mod 8 cannot come from whole bytes.
const BAD_LENGTHS = new Set([1, 3, 6]);

export const DEFAULT_DIGITS = 6;
export const DEFAULT_PERIOD = 30;

function decodeBase32(text) {
  const clean = text.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  if (!clean || BAD_LENGTHS.has(clean.length % 8)) return null;
  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let n = 0;
  for (const c of clean) {
    const d = BASE32.indexOf(c);
    if (d < 0) return null;
    value = ((value << 5) | d) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      out[n++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return out;
}

const fail = (reason) => ({ ok: false, reason });

function intParam(q, name, min, max, fallback) {
  const raw = q.get(name);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

function parseUri(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return fail('uri');
  }
  if (url.hostname.toLowerCase() === 'hotp') return fail('hotp');
  if (url.hostname.toLowerCase() !== 'totp') return fail('uri');
  const q = url.searchParams;
  const digits = intParam(q, 'digits', 6, 8, DEFAULT_DIGITS);
  if (digits === null) return fail('digits');
  const period = intParam(q, 'period', 1, 300, DEFAULT_PERIOD);
  if (period === null) return fail('period');
  const algorithm = ALGORITHMS[(q.get('algorithm') ?? 'SHA1').toUpperCase()];
  if (!algorithm) return fail('algorithm');
  const secret = decodeBase32(q.get('secret') ?? '');
  if (!secret) return fail('base32');
  return { ok: true, secret, digits, period, algorithm };
}

export function parseOtp(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fail('empty');
  if (/^otpauth:/i.test(text)) return parseUri(text);
  const secret = decodeBase32(text);
  if (!secret) return fail('base32');
  return { ok: true, secret, digits: DEFAULT_DIGITS, period: DEFAULT_PERIOD, algorithm: ALGORITHMS.SHA1 };
}

export const isTotpUri = (text) => /^otpauth:\/\/totp\//i.test(String(text).trim());

export async function totp({ secret, digits, period, algorithm }, nowMs) {
  const counter = Math.floor(nowMs / 1000 / period);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter % 2 ** 32);
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg.buffer));
  const off = mac[mac.length - 1] & 0x0f;
  const n = ((mac[off] & 0x7f) * 2 ** 24 + (mac[off + 1] << 16) + (mac[off + 2] << 8) + mac[off + 3]) % 10 ** digits;
  return String(n).padStart(digits, '0');
}

export const secondsLeft = ({ period }, nowMs) => period - (Math.floor(nowMs / 1000) % period);
