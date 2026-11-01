// Every API response is built here, so no-store and nosniff cannot be forgotten: Cloudflare does not
// apply _headers to Functions (KM-005 Concern 12).
const BASE_HEADERS = Object.freeze({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
const JSON_TYPE = 'application/json; charset=utf-8';

export const MAX_BODY_BYTES = 2_000_000;

// Fixed per code: a message never carries input, stored data, a stack or a query (FR04).
const ERRORS = Object.freeze({
  bad_request: [400, 'Malformed request'],
  invalid_id: [400, 'Invalid vault id'],
  invalid_kdf: [400, 'Invalid KDF parameters'],
  invalid_envelope: [400, 'Invalid envelope'],
  unauthorized: [401, 'Authentication required'],
  invalid_credentials: [401, 'Invalid username or authentication key'],
  registration_closed: [403, 'Registration is closed'],
  forbidden_origin: [403, 'Origin not allowed'],
  not_found: [404, 'Not found'],
  username_taken: [409, 'Username already exists'],
  vault_exists: [409, 'Vault id already exists'],
  version_conflict: [409, 'Version conflict'],
  too_large: [413, 'Request too large'],
  too_many_attempts: [429, 'Too many attempts'],
  internal: [500, 'Internal error'],
});

export class ApiError extends Error {
  constructor(code, { headers, fields } = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.headers = headers;
    this.fields = fields;
  }
}

export function emptyResponse(status, headers = {}) {
  return new Response(null, { status, headers: { ...BASE_HEADERS, ...headers } });
}

// `text` is JSON already serialised: lets a stored blob pass through without being parsed again.
export function rawJsonResponse(status, text, headers = {}) {
  return new Response(text, { status, headers: { ...BASE_HEADERS, 'Content-Type': JSON_TYPE, ...headers } });
}

export function jsonResponse(status, value, headers = {}) {
  return rawJsonResponse(status, JSON.stringify(value), headers);
}

export function errorResponse(code, { headers, fields } = {}) {
  const [status, message] = ERRORS[code];
  return jsonResponse(status, { error: code, message, ...fields }, headers);
}

// Counts the bytes actually received: Content-Length may be absent or wrong.
export async function readBody(request) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError('too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

// null when the body is not a JSON object. Bad UTF-8 counts as bad JSON.
export function parseObject(bytes) {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export async function readJsonObject(request) {
  const value = parseObject(await readBody(request));
  if (value === null) throw new ApiError('bad_request');
  return value;
}
