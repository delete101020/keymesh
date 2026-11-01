import { fromBase64, toBase64, toHex, randomBytes, utf8Encode } from '../../public/js/core/bytes.js';
import { ApiError } from './_http.js';

export const LABEL_FAKE_SALT = 'keymesh/fake-salt';
export const LABEL_FAKE_AUTH = 'keymesh/fake-auth';
export const LABEL_ATTEMPT_USER = 'keymesh/attempt-user';
export const LABEL_ATTEMPT_IP = 'keymesh/attempt-ip';

export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

// One secret, separated by label, for the fake salt, the fake hash and the counter keys.
export async function labeledHmac(secret, label, value) {
  const key = await crypto.subtle.importKey('raw', utf8Encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8Encode(`${label}\0${value}`)));
}

// No default value: a guessable secret would make fake salts predictable (FR10).
export function requireServerSecret(env) {
  const secret = env.SERVER_SECRET;
  if (typeof secret !== 'string' || secret === '') throw new ApiError('internal');
  return secret;
}

export const safeEqual = (a, b) => crypto.subtle.timingSafeEqual(a, b);

// Hashing first gives both sides one length, so the comparison does not reveal the configured length.
export async function safeEqualStrings(a, b) {
  return safeEqual(await sha256(utf8Encode(a)), await sha256(utf8Encode(b)));
}

export const hashAuthKey = async (authKeyBase64) => sha256(fromBase64(authKeyBase64, 'authKey'));

export function newToken() {
  return toBase64(randomBytes(32)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export const hashToken = async (token) => toBase64(await sha256(utf8Encode(token)));
export const newId = (prefix) => `${prefix}${toHex(randomBytes(8))}`;
export const newStamp = () => toHex(randomBytes(16));
