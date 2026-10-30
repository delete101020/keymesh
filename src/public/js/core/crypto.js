import { KeymeshError } from './errors.js';
import { toBase64, fromBase64, toHex, utf8Encode, randomBytes, zeroize } from './bytes.js';

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

// --- key handles ---------------------------------------------------------------------------------

// Keys leave this module only as opaque handles: the CryptoKey sits in a private field that only
// code in this file can read, so callers cannot exportKey() an extractable accountKey/vaultKey.
const HANDLE_TOKEN = Symbol('keymesh.key');
let readKey;

class KeyHandle {
  #key;
  #kind;
  constructor(token, key, kind) {
    if (token !== HANDLE_TOKEN) throw new KeymeshError('invalid', 'key');
    this.#key = key;
    this.#kind = kind;
  }
  get kind() {
    return this.#kind;
  }
  static {
    readKey = (handle, kinds, field) => {
      if (!(handle instanceof KeyHandle) || !kinds.includes(handle.#kind)) throw new KeymeshError('invalid', field);
      return handle.#key;
    };
  }
}

const handle = (key, kind) => new KeyHandle(HANDLE_TOKEN, key, kind);

// --- key hierarchy -------------------------------------------------------------------------------

export const KDF_NAME = 'PBKDF2-SHA256';
export const KDF_MIN_ITER = 600000;
const SALT_LEN = 16;
const WRAPPED_KEY_CT_LEN = KEY_BITS / 8 + TAG_LEN;
const VAULT_ID_RE = /^[0-9a-f]{16}$/;

const INFO_ENC = utf8Encode('keymesh/enc');
const INFO_AUTH = utf8Encode('keymesh/auth');
const INFO_PRF = utf8Encode('keymesh/prf');
const AAD_ACCOUNT_KEY = 'keymesh/v2/account-key';
const aadVaultKey = (vaultId) => `keymesh/v2/vault-key/${vaultId}`;

const WRAP_USAGES = ['wrapKey', 'unwrapKey'];
const DATA_USAGES = ['encrypt', 'decrypt'];

function checkVaultId(vaultId) {
  if (typeof vaultId !== 'string' || !VAULT_ID_RE.test(vaultId)) throw new KeymeshError('invalid', 'vaultId');
}

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Envelope fields are validated before any decryption is attempted (FR11).
function readIv(env) {
  const iv = fromBase64(env.iv, 'iv');
  if (iv.length !== IV_LEN) throw new KeymeshError('format', 'iv');
  return iv;
}

function readCt(env, exactLen) {
  const ct = fromBase64(env.ct, 'ct');
  if (exactLen ? ct.length !== exactLen : ct.length <= TAG_LEN) throw new KeymeshError('format', 'ct');
  return ct;
}

export function newKdf() {
  assertSupported();
  return { name: KDF_NAME, iter: KDF_MIN_ITER, salt: toBase64(randomBytes(SALT_LEN)) };
}

function readKdf(kdf) {
  if (!isObject(kdf) || typeof kdf.name !== 'string') throw new KeymeshError('format', 'kdf');
  if (kdf.name !== KDF_NAME) throw new KeymeshError('unsupported', 'kdf.name');
  if (!Number.isSafeInteger(kdf.iter)) throw new KeymeshError('format', 'kdf.iter');
  if (kdf.iter < KDF_MIN_ITER) throw new KeymeshError('unsupported', 'kdf.iter');
  const salt = fromBase64(kdf.salt, 'kdf.salt');
  if (salt.length !== SALT_LEN) throw new KeymeshError('format', 'kdf.salt');
  return { iter: kdf.iter, salt };
}

async function hkdfAesKey(base, info, usages) {
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: EMPTY, info }, base, { name: 'AES-GCM', length: KEY_BITS }, false, usages);
}

export async function deriveFromPassword(password, kdf) {
  assertSupported();
  if (typeof password !== 'string') throw new KeymeshError('invalid', 'password');
  const { iter, salt } = readKdf(kdf);
  const pw = utf8Encode(password);
  const master = await pbkdf2(pw, salt, iter);
  zeroize(pw);
  const base = await subtle().importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
  zeroize(master);
  const encKey = handle(await hkdfAesKey(base, INFO_ENC, WRAP_USAGES), 'enc');
  const authKey = await hkdfBits(base, EMPTY, INFO_AUTH);
  return { encKey, authKey };
}

export async function deriveFromPrf(prfBytes) {
  assertSupported();
  if (!(prfBytes instanceof Uint8Array) || prfBytes.length !== 32) throw new KeymeshError('invalid', 'prf');
  const base = await subtle().importKey('raw', prfBytes, 'HKDF', false, ['deriveKey']);
  return handle(await hkdfAesKey(base, INFO_PRF, WRAP_USAGES), 'prf');
}

export async function generateAccountKey() {
  assertSupported();
  return handle(await subtle().generateKey({ name: 'AES-GCM', length: KEY_BITS }, true, WRAP_USAGES), 'account');
}

export async function generateVaultKey() {
  assertSupported();
  return handle(await subtle().generateKey({ name: 'AES-GCM', length: KEY_BITS }, true, DATA_USAGES), 'vault');
}

export function newVaultId() {
  assertSupported();
  return toHex(randomBytes(8));
}

async function wrapWith(key, wrappingKey, aad, iv) {
  const ct = new Uint8Array(
    await subtle().wrapKey('raw', key, wrappingKey, { name: 'AES-GCM', iv, additionalData: utf8Encode(aad), tagLength: TAG_LEN * 8 }),
  );
  return { iv: toBase64(iv), ct: toBase64(ct) };
}

async function unwrapWith(iv, ct, unwrappingKey, aad, usages) {
  try {
    return await subtle().unwrapKey(
      'raw',
      ct,
      unwrappingKey,
      { name: 'AES-GCM', iv, additionalData: utf8Encode(aad), tagLength: TAG_LEN * 8 },
      { name: 'AES-GCM', length: KEY_BITS },
      true,
      usages,
    );
  } catch {
    throw new KeymeshError('decrypt-failed');
  }
}

async function sealAccountKey(accountKey, wrappingKey, iv) {
  const key = readKey(accountKey, ['account'], 'accountKey');
  const wrapper = readKey(wrappingKey, ['enc', 'prf'], 'wrappingKey');
  return wrapWith(key, wrapper, AAD_ACCOUNT_KEY, iv);
}

export async function wrapAccountKey(accountKey, wrappingKey) {
  assertSupported();
  return sealAccountKey(accountKey, wrappingKey, randomBytes(IV_LEN));
}

export async function unwrapAccountKey(wrapped, wrappingKey) {
  assertSupported();
  const wrapper = readKey(wrappingKey, ['enc', 'prf'], 'wrappingKey');
  if (!isObject(wrapped)) throw new KeymeshError('format', 'wrappedAccountKey');
  const iv = readIv(wrapped);
  const ct = readCt(wrapped, WRAPPED_KEY_CT_LEN);
  return handle(await unwrapWith(iv, ct, wrapper, AAD_ACCOUNT_KEY, WRAP_USAGES), 'account');
}

async function sealVaultKey(vaultKey, accountKey, vaultId, iv) {
  checkVaultId(vaultId);
  const key = readKey(vaultKey, ['vault'], 'vaultKey');
  const wrapper = readKey(accountKey, ['account'], 'accountKey');
  return { by: 'account', ...(await wrapWith(key, wrapper, aadVaultKey(vaultId), iv)) };
}

export async function wrapVaultKey(vaultKey, accountKey, vaultId) {
  assertSupported();
  return sealVaultKey(vaultKey, accountKey, vaultId, randomBytes(IV_LEN));
}

export async function unwrapVaultKey(wrapped, accountKey, vaultId) {
  assertSupported();
  checkVaultId(vaultId);
  const wrapper = readKey(accountKey, ['account'], 'accountKey');
  if (!isObject(wrapped) || typeof wrapped.by !== 'string') throw new KeymeshError('format', 'wrappedVaultKey');
  if (wrapped.by !== 'account') throw new KeymeshError('unsupported', 'by');
  const iv = readIv(wrapped);
  const ct = readCt(wrapped, WRAPPED_KEY_CT_LEN);
  return handle(await unwrapWith(iv, ct, wrapper, aadVaultKey(vaultId), DATA_USAGES), 'vault');
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
  importKey: async (raw, kind) =>
    handle(await aesKey(raw, kind === 'vault' ? DATA_USAGES : WRAP_USAGES, kind === 'account' || kind === 'vault'), kind),
  sealAccountKey,
  sealVaultKey,
  IV_LEN,
  TAG_LEN,
  EMPTY,
});
