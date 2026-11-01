// Shape checks only: nothing here can look inside an encrypted block, and the server never tries (FR28).
import { ENVELOPE_ALG, ENVELOPE_FORMAT, ENVELOPE_VERSION, KDF_MAX_ITER, KDF_MIN_ITER, KDF_NAME } from '../../public/js/core/crypto.js';
import { ApiError, MAX_BODY_BYTES } from './_http.js';

const USERNAME_RE = /^[A-Za-z0-9._@+-]{1,64}$/;
const VAULT_ID_RE = /^[0-9a-f]{16}$/;
const B64_12_BYTES_RE = /^[A-Za-z0-9+/]{16}$/;
const B64_16_BYTES_RE = /^[A-Za-z0-9+/]{21}[AQgw]==$/;
const B64_32_BYTES_RE = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
// A regex, not a decode: `ct` can be 2 MB and the Free plan allows 10 ms of CPU per request (plan §4).
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// Generous bound for the ids, numbers and SQLite framing of a row, next to its long text columns.
const ROW_OVERHEAD_BYTES = 256;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasExactly = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isBase64 = (value) => typeof value === 'string' && value.length > 0 && value.length % 4 === 0 && B64_RE.test(value);
const isEncrypted = (value) => B64_12_BYTES_RE.test(value.iv) && isBase64(value.ct);

const refuse = (code) => {
  throw new ApiError(code);
};

export const validUsername = (value) => typeof value === 'string' && USERNAME_RE.test(value);
export const validVaultId = (value) => typeof value === 'string' && VAULT_ID_RE.test(value);

export function checkUsername(value) {
  if (!validUsername(value)) refuse('bad_request');
}

export function checkKdf(kdf) {
  const ok =
    hasExactly(kdf, ['name', 'iter', 'salt']) &&
    kdf.name === KDF_NAME &&
    Number.isInteger(kdf.iter) &&
    kdf.iter >= KDF_MIN_ITER &&
    kdf.iter <= KDF_MAX_ITER &&
    typeof kdf.salt === 'string' &&
    B64_16_BYTES_RE.test(kdf.salt);
  if (!ok) refuse('invalid_kdf');
}

export function checkAuthKey(value) {
  if (typeof value !== 'string' || !B64_32_BYTES_RE.test(value)) refuse('bad_request');
}

export function checkDeviceName(value) {
  if (value !== undefined && (typeof value !== 'string' || value.length > 100)) refuse('bad_request');
}

export function checkWrappedAccountKey(value) {
  if (!hasExactly(value, ['iv', 'ct']) || !isEncrypted(value)) refuse('bad_request');
}

export function checkWrappedVaultKey(value) {
  if (!hasExactly(value, ['by', 'iv', 'ct']) || value.by !== 'account' || !isEncrypted(value)) refuse('bad_request');
}

export function checkMeta(value) {
  if (!hasExactly(value, ['iv', 'ct']) || !isEncrypted(value)) refuse('bad_request');
}

export function checkBlob(value) {
  const ok =
    hasExactly(value, ['format', 'v', 'alg', 'iv', 'ct']) &&
    value.format === ENVELOPE_FORMAT &&
    value.v === ENVELOPE_VERSION &&
    value.alg === ENVELOPE_ALG &&
    isEncrypted(value);
  if (!ok) refuse('invalid_envelope');
}

// The vault part shared by register and create: id first, then keys and meta, then the blob.
export function checkNewVault(vault) {
  if (!isObject(vault) || typeof vault.id !== 'string') refuse('bad_request');
  if (!validVaultId(vault.id)) refuse('invalid_id');
  checkWrappedVaultKey(vault.wrappedVaultKey);
  checkMeta(vault.meta);
  checkBlob(vault.blob);
}

// Checked blocks are pure ASCII, so a string's length is its size in bytes. Local D1 has no row limit
// and real D1 has one (2 000 000 bytes), so the server enforces it itself: same behaviour in both (FR05).
export function checkRowFits(...texts) {
  const total = texts.reduce((sum, text) => sum + (typeof text === 'number' ? text : text.length), ROW_OVERHEAD_BYTES);
  if (total > MAX_BODY_BYTES) refuse('too_large');
}
