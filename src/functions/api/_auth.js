import { fromBase64, toBase64 } from '../../public/js/core/bytes.js';
import { KDF_MIN_ITER, KDF_NAME } from '../../public/js/core/crypto.js';
import { ApiError, emptyResponse, jsonResponse, parseObject, readBody, readJsonObject } from './_http.js';
import { assertNotLocked, attemptKeys, clearUserCounter, recordFailure, removeStale } from './_rate-limit.js';
import { LABEL_FAKE_AUTH, LABEL_FAKE_SALT, hashAuthKey, hashToken, labeledHmac, newId, newStamp, newToken, requireServerSecret, safeEqual, safeEqualStrings } from './_secrets.js';
import { checkAuthKey, checkDeviceName, checkKdf, checkNewVault, checkRowFits, checkUsername, checkWrappedAccountKey } from './_validate.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_REGISTRATION_TOKEN_LENGTH = 32;

// username is ASCII only (FR07), so lowercasing here matches COLLATE NOCASE in dt_user.
const folded = (username) => username.toLowerCase();

async function newSession(db, { userId, stamp, deviceName, now }) {
  const token = newToken();
  const sessionId = newId('s_');
  const expiresAt = now + SESSION_MS;
  const statement = db
    .prepare('INSERT INTO dt_session (id, user_id, token_hash, security_stamp, device_name, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(sessionId, userId, await hashToken(token), stamp, deviceName ?? null, now, now, expiresAt);
  return { token, sessionId, expiresAt, statement };
}

export async function prelogin({ env, url }) {
  const username = url.searchParams.get('username');
  checkUsername(username);
  const secret = requireServerSecret(env);
  const fake = await labeledHmac(secret, LABEL_FAKE_SALT, folded(username));
  const user = await env.DB.prepare('SELECT kdf_name, kdf_iter, kdf_salt FROM dt_user WHERE username = ?').bind(username).first();
  const kdf = user
    ? { name: user.kdf_name, iter: user.kdf_iter, salt: user.kdf_salt }
    : { name: KDF_NAME, iter: KDF_MIN_ITER, salt: toBase64(fake.subarray(0, 16)) };
  return jsonResponse(200, { kdf });
}

async function checkRegistrationToken(env, given) {
  const configured = env.REGISTRATION_TOKEN;
  const open = typeof configured === 'string' && configured.length >= MIN_REGISTRATION_TOKEN_LENGTH;
  const same = await safeEqualStrings(typeof given === 'string' ? given : '', open ? configured : '');
  if (!open || !same) throw new ApiError('registration_closed');
}

function conflictFrom(error) {
  const message = String(error?.message);
  if (message.includes('dt_user.username')) return new ApiError('username_taken');
  if (message.includes('dt_vault.id')) return new ApiError('vault_exists');
  return error;
}

export async function register({ request, env }) {
  const bytes = await readBody(request);
  // The token travels in the body, so a body that does not parse has no token (plan decision 5).
  const body = parseObject(bytes);
  await checkRegistrationToken(env, body?.registrationToken);

  checkUsername(body.username);
  checkKdf(body.kdf);
  checkAuthKey(body.authKey);
  checkWrappedAccountKey(body.wrappedAccountKey);
  checkDeviceName(body.deviceName);
  checkNewVault(body.vault);

  const { vault } = body;
  const blob = JSON.stringify(vault.blob);
  const wrappedVaultKey = JSON.stringify(vault.wrappedVaultKey);
  const meta = JSON.stringify(vault.meta);
  checkRowFits(blob, wrappedVaultKey, meta);

  const now = Date.now();
  const userId = newId('u_');
  const stamp = newStamp();
  const authHash = toBase64(await hashAuthKey(body.authKey));
  const session = await newSession(env.DB, { userId, stamp, deviceName: body.deviceName, now });
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO dt_user (id, username, kdf_name, kdf_iter, kdf_salt, auth_hash, wrapped_account_key, security_stamp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(userId, body.username, body.kdf.name, body.kdf.iter, body.kdf.salt, authHash, JSON.stringify(body.wrappedAccountKey), stamp, now, now),
      env.DB.prepare(
        'INSERT INTO dt_vault (id, user_id, wrapped_vault_key, meta, meta_version, version, blob, size, created_at, updated_at, updated_by_session) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)',
      ).bind(vault.id, userId, wrappedVaultKey, meta, blob, blob.length, now, now, session.sessionId),
      session.statement,
    ]);
  } catch (error) {
    throw conflictFrom(error);
  }
  return jsonResponse(201, { userId, token: session.token, expiresAt: session.expiresAt, vault: { id: vault.id, version: 1, metaVersion: 1 } });
}

export async function login({ request, env, waitUntil }) {
  const body = await readJsonObject(request);
  checkUsername(body.username);
  checkAuthKey(body.authKey);
  checkDeviceName(body.deviceName);
  const secret = requireServerSecret(env);

  const now = Date.now();
  waitUntil(removeStale(env.DB, now));
  const keys = await attemptKeys(request, secret, body.username);
  await assertNotLocked(env.DB, keys, now);

  const user = await env.DB.prepare('SELECT id, kdf_name, kdf_iter, kdf_salt, auth_hash, wrapped_account_key, security_stamp FROM dt_user WHERE username = ?').bind(body.username).first();
  // Both branches hash and compare: an unknown username does the same work against a keyed fake (FR16).
  const fake = await labeledHmac(secret, LABEL_FAKE_AUTH, folded(body.username));
  const expected = user ? fromBase64(user.auth_hash, 'auth_hash') : fake;
  const same = safeEqual(await hashAuthKey(body.authKey), expected);
  if (!user || !same) {
    await recordFailure(env.DB, keys, now);
    throw new ApiError('invalid_credentials');
  }

  const session = await newSession(env.DB, { userId: user.id, stamp: user.security_stamp, deviceName: body.deviceName, now });
  await env.DB.batch([session.statement, clearUserCounter(env.DB, keys)]);
  return jsonResponse(200, {
    userId: user.id,
    token: session.token,
    expiresAt: session.expiresAt,
    sessionId: session.sessionId,
    kdf: { name: user.kdf_name, iter: user.kdf_iter, salt: user.kdf_salt },
    wrappedAccountKey: JSON.parse(user.wrapped_account_key),
  });
}

// One statement: the checks and the sliding renewal cannot be separated by another request.
export async function authenticate(request, env) {
  const match = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '');
  if (!match || !TOKEN_RE.test(match[1])) throw new ApiError('unauthorized');
  const now = Date.now();
  const session = await env.DB.prepare(
    `UPDATE dt_session SET expires_at = ?1, last_seen_at = ?2
     WHERE token_hash = ?3 AND expires_at > ?2
       AND security_stamp = (SELECT security_stamp FROM dt_user WHERE dt_user.id = dt_session.user_id)
     RETURNING id, user_id`,
  )
    .bind(now + SESSION_MS, now, await hashToken(match[1]))
    .first();
  if (!session) throw new ApiError('unauthorized');
  return { id: session.id, userId: session.user_id };
}

export async function logout({ env, session }) {
  await env.DB.prepare('DELETE FROM dt_session WHERE id = ?').bind(session.id).run();
  return emptyResponse(204);
}
