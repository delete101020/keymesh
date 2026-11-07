// Calls to the KeyMesh API (docs/06), turned into results the callers can branch on. Holds nothing between
// calls: the token comes in every time. A request that hangs past TIMEOUT_MS counts as lost connection, so
// a stalled phone network never blocks a sync round (KM-006 FR24, plan §4).
export const TIMEOUT_MS = 30_000;

// { ok: true, status, body, etag? } | { ok: false, kind: 'network' } | { ok: false, kind: 'http', status, code, retryAfter? }
export function createApi({ fetch = (...a) => globalThis.fetch(...a), timeoutMs = TIMEOUT_MS } = {}) {
  async function call(method, path, { token, json, headers = {} } = {}) {
    const sent = { ...headers };
    if (token) sent.Authorization = `Bearer ${token}`;
    if (json !== undefined) sent['Content-Type'] = 'application/json';
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    let response;
    let text;
    try {
      response = await fetch(path, { method, headers: sent, body: json === undefined ? undefined : JSON.stringify(json), signal: abort.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
      text = await response.text();
    } catch {
      return { ok: false, kind: 'network' };
    } finally {
      clearTimeout(timer);
    }
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (response.status === 304) return { ok: true, status: 304, body: null, notModified: true };
    if (response.ok) return { ok: true, status: response.status, body, etag: response.headers.get('ETag') };
    const out = { ok: false, kind: 'http', status: response.status, code: typeof body?.error === 'string' ? body.error : null };
    if (response.status === 429) out.retryAfter = Math.max(0, Number(response.headers.get('Retry-After')) || 0);
    if (response.status === 409 && body?.error === 'version_conflict') out.conflict = { version: body.version, blob: body.blob };
    return out;
  }

  return {
    prelogin: (username) => call('GET', `/api/prelogin?username=${encodeURIComponent(username)}`),
    register: (body) => call('POST', '/api/register', { json: body }),
    login: (body) => call('POST', '/api/login', { json: body }),
    logout: (token) => call('POST', '/api/logout', { token }),
    listVaults: (token, etag) => call('GET', '/api/vaults', { token, headers: etag ? { 'If-None-Match': etag } : {} }),
    getVault: (token, id) => call('GET', `/api/vaults/${encodeURIComponent(id)}`, { token }),
    putVault: (token, id, baseVersion, blob) => call('PUT', `/api/vaults/${encodeURIComponent(id)}`, { token, json: { baseVersion, blob } }),
  };
}
