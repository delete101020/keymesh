// Every query filters on the session's user_id: a vault that is someone else's and one that does not
// exist take the same path to the same 404 (FR31).
import { toHex, utf8Encode } from '../../public/js/core/bytes.js';
import { ApiError, emptyResponse, jsonResponse, rawJsonResponse, readJsonObject } from './_http.js';
import { sha256 } from './_secrets.js';
import { checkBlob, checkNewVault, checkRowFits } from './_validate.js';

const SINCE_RE = /^\d{1,15}$/;

function notFound() {
  return new ApiError('not_found');
}

async function listEtag(rows) {
  const text = rows.map((row) => `${row.id}:${row.version}:${row.meta_version}`).join(',');
  return `"${toHex(await sha256(utf8Encode(text)))}"`;
}

// Cloudflare may weaken an ETag when it compresses a response, so W/ does not count (plan §4).
function etagMatches(header, etag) {
  if (header === null) return false;
  return header.split(',').some((part) => {
    const candidate = part.trim().replace(/^W\//, '');
    return candidate === '*' || candidate === etag;
  });
}

export async function listVaults({ request, env, session }) {
  const { results } = await env.DB.prepare(
    'SELECT id, version, meta_version, size, created_at, updated_at, wrapped_vault_key, meta FROM dt_vault WHERE user_id = ? ORDER BY created_at, id',
  )
    .bind(session.userId)
    .all();
  const etag = await listEtag(results);
  if (etagMatches(request.headers.get('If-None-Match'), etag)) return emptyResponse(304, { ETag: etag });
  const items = results.map((row) => ({
    id: row.id,
    version: row.version,
    metaVersion: row.meta_version,
    size: row.size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wrappedVaultKey: JSON.parse(row.wrapped_vault_key),
    meta: JSON.parse(row.meta),
  }));
  return jsonResponse(200, { items }, { ETag: etag });
}

export async function createVault({ request, env, session }) {
  const vault = await readJsonObject(request);
  checkNewVault(vault);
  const blob = JSON.stringify(vault.blob);
  const wrappedVaultKey = JSON.stringify(vault.wrappedVaultKey);
  const meta = JSON.stringify(vault.meta);
  checkRowFits(blob, wrappedVaultKey, meta);
  const now = Date.now();
  try {
    await env.DB.prepare(
      'INSERT INTO dt_vault (id, user_id, wrapped_vault_key, meta, meta_version, version, blob, size, created_at, updated_at, updated_by_session) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)',
    )
      .bind(vault.id, session.userId, wrappedVaultKey, meta, blob, blob.length, now, now, session.id)
      .run();
  } catch (error) {
    if (String(error?.message).includes('dt_vault.id')) throw new ApiError('vault_exists');
    throw error;
  }
  return jsonResponse(201, { id: vault.id, version: 1, metaVersion: 1 });
}

// The stored blob goes out as stored, spliced rather than parsed: up to 2 MB under a 10 ms CPU budget.
const withBlob = (fields, blob) => `${JSON.stringify(fields).slice(0, -1)},"blob":${blob}}`;

export async function readVault({ env, url, session, vaultId }) {
  const row = await env.DB.prepare('SELECT version, updated_at, blob FROM dt_vault WHERE id = ? AND user_id = ?').bind(vaultId, session.userId).first();
  if (!row) throw notFound();
  const since = url.searchParams.get('since');
  if (since !== null && !SINCE_RE.test(since)) throw new ApiError('bad_request');
  if (since !== null && Number(since) === row.version) return emptyResponse(304);
  return rawJsonResponse(200, withBlob({ version: row.version, updatedAt: row.updated_at }, row.blob));
}

export async function writeVault({ request, env, session, vaultId }) {
  // Ownership before the body: someone else's vault with a bad blob is still the plain 404.
  const owned = await env.DB.prepare('SELECT length(wrapped_vault_key) + length(meta) AS other FROM dt_vault WHERE id = ? AND user_id = ?').bind(vaultId, session.userId).first();
  if (!owned) throw notFound();

  const body = await readJsonObject(request);
  if (!Number.isSafeInteger(body.baseVersion) || body.baseVersion < 0) throw new ApiError('bad_request');
  checkBlob(body.blob);
  const blob = JSON.stringify(body.blob);
  checkRowFits(blob, owned.other);

  const now = Date.now();
  // One statement: comparing the version and writing cannot be separated by another device (FR30).
  const written = await env.DB.prepare(
    `UPDATE dt_vault SET blob = ?1, size = ?2, version = version + 1, updated_at = ?3, updated_by_session = ?4
     WHERE id = ?5 AND user_id = ?6 AND version = ?7
     RETURNING version, updated_at`,
  )
    .bind(blob, blob.length, now, session.id, vaultId, session.userId, body.baseVersion)
    .first();
  if (written) return jsonResponse(200, { version: written.version, updatedAt: written.updated_at });

  const current = await env.DB.prepare('SELECT version, updated_at, blob FROM dt_vault WHERE id = ? AND user_id = ?').bind(vaultId, session.userId).first();
  if (!current) throw notFound();
  return rawJsonResponse(409, withBlob({ error: 'version_conflict', message: 'Version conflict', version: current.version, updatedAt: current.updated_at }, current.blob));
}
