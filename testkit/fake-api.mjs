// The API of docs/06 as an object with the same methods as js/remote.js, in memory, for Node tests of auth.js
// and sync.js. Behaves like the real server on the paths the client uses (versions, 304, 409 with the server
// copy, 401 after logout); `override(name, fn)` replaces one answer to make a fault. The real server is
// exercised by test/sync/*.sync.js.
let seq = 0;
const id = (p) => `${p}_${(++seq).toString(16).padStart(16, '0')}`;
const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const ok = (status, body, extra = {}) => ({ ok: true, status, body: clone(body), ...extra });
const http = (status, code, extra = {}) => ({ ok: false, kind: 'http', status, code, ...extra });

export function fakeApi({ registrationToken = 'registration-token-of-at-least-32-chars', clock = () => Date.now() } = {}) {
  const users = new Map(); // lower-case username -> user
  const vaults = new Map();
  const sessions = new Map(); // token -> userId
  const overrides = new Map();
  const calls = [];

  const userOf = (token) => (sessions.has(token) ? sessions.get(token) : null);
  const etagOf = (userId) => `"${[...vaults.values()].filter((v) => v.userId === userId).map((v) => `${v.id}:${v.version}:${v.metaVersion}`).join(',')}"`;
  const newSession = (userId) => {
    const token = `tok-${id('t')}-${'x'.repeat(24)}`;
    sessions.set(token, userId);
    return token;
  };

  const real = {
    prelogin(username) {
      const u = users.get(username.toLowerCase());
      return ok(200, { kdf: u ? u.kdf : { name: 'PBKDF2-SHA256', iter: 600000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' } });
    },
    register(body) {
      if (body.registrationToken !== registrationToken) return http(403, 'registration_closed');
      if (users.has(body.username.toLowerCase())) return http(409, 'username_taken');
      if (vaults.has(body.vault.id)) return http(409, 'vault_exists');
      const userId = id('u');
      users.set(body.username.toLowerCase(), { userId, username: body.username, kdf: clone(body.kdf), authKey: body.authKey, wrappedAccountKey: clone(body.wrappedAccountKey) });
      vaults.set(body.vault.id, { id: body.vault.id, userId, version: 1, metaVersion: 1, wrappedVaultKey: clone(body.vault.wrappedVaultKey), meta: clone(body.vault.meta), blob: clone(body.vault.blob), createdAt: clock() });
      return ok(201, { userId, token: newSession(userId), expiresAt: clock() + 30 * 86400000, vault: { id: body.vault.id, version: 1, metaVersion: 1 } });
    },
    login({ username, authKey }) {
      const u = users.get(username.toLowerCase());
      if (!u || u.authKey !== authKey) return http(401, 'invalid_credentials');
      return ok(200, { userId: u.userId, token: newSession(u.userId), expiresAt: clock() + 30 * 86400000, sessionId: id('s'), kdf: u.kdf, wrappedAccountKey: u.wrappedAccountKey });
    },
    logout(token) {
      if (!userOf(token)) return http(401, 'unauthorized');
      sessions.delete(token);
      return ok(204, null);
    },
    listVaults(token, etag) {
      const userId = userOf(token);
      if (!userId) return http(401, 'unauthorized');
      const tag = etagOf(userId);
      if (etag === tag) return { ok: true, status: 304, body: null, notModified: true };
      const items = [...vaults.values()].filter((v) => v.userId === userId).map(({ blob, userId: _, ...v }) => ({ ...v, size: JSON.stringify(blob).length }));
      return ok(200, { items }, { etag: tag });
    },
    getVault(token, vaultId) {
      const v = vaults.get(vaultId);
      if (!userOf(token)) return http(401, 'unauthorized');
      if (!v || v.userId !== userOf(token)) return http(404, 'not_found');
      return ok(200, { version: v.version, updatedAt: 0, blob: v.blob });
    },
    putVault(token, vaultId, baseVersion, blob) {
      const v = vaults.get(vaultId);
      if (!userOf(token)) return http(401, 'unauthorized');
      if (!v || v.userId !== userOf(token)) return http(404, 'not_found');
      if (baseVersion !== v.version) return http(409, 'version_conflict', { conflict: { version: v.version, blob: clone(v.blob) } });
      v.version += 1;
      v.blob = clone(blob);
      return ok(200, { version: v.version, updatedAt: 0 });
    },
  };

  const api = {};
  for (const name of Object.keys(real)) {
    api[name] = async (...args) => {
      calls.push(name);
      const fn = overrides.get(name);
      return fn ? fn(real[name], ...args) : real[name](...args);
    };
  }
  return {
    api,
    calls,
    vaults,
    users,
    sessions,
    // fn(real, ...args) answers instead of the real method until reset.
    override: (name, fn) => overrides.set(name, fn),
    reset: (name) => overrides.delete(name),
    // A vault made outside the client under test (another device), for AC35-style cases.
    put(vault) {
      vaults.set(vault.id, clone(vault));
    },
    registrationToken,
  };
}
