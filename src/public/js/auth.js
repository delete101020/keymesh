// Register, log in, log out and wipe (KM-006 FR03–FR14). Nothing here keeps a password, key or token past
// the call that needs it, except a pending login waiting for the user to choose (FR09), which holds them in
// its closure until replace() or cancel().
import { deriveFromPassword, unlockWithAccountKey, unwrapAccountKey, KDF_MAX_ITER, KDF_MIN_ITER, KDF_NAME } from './core/crypto.js';
import { toBase64, zeroize } from './core/bytes.js';
import { newId } from './core/model.js';
import { syncedVaultRow, toRecord } from './store.js';
import { pickActive } from './session.js';

// docs/06: 1–64 characters of ASCII letters, digits and . _ - @ +. Checked here so a bad name costs no request.
export function usernameError(name) {
  if (!name) return 'empty';
  if (name.length > 64) return 'too-long';
  return /^[A-Za-z0-9._@+-]+$/.test(name) ? null : 'chars';
}

// Refused before any key derivation: an unbounded iter from a server would hang the client (FR06).
export const kdfAcceptable = (kdf) =>
  kdf !== null && typeof kdf === 'object' && kdf.name === KDF_NAME && Number.isSafeInteger(kdf.iter) && kdf.iter >= KDF_MIN_ITER && kdf.iter <= KDF_MAX_ITER;

const sameBytes = (a, b) => a?.iv === b?.iv && a?.ct === b?.ct;

// An API failure as one of the codes the screens know.
function failure(r) {
  if (r.kind === 'network') return { ok: false, error: 'network' };
  if (r.status === 429) return { ok: false, error: 'rate-limited', minutes: Math.max(1, Math.ceil(r.retryAfter / 60)) };
  if (r.status === 401) return { ok: false, error: 'invalid-credentials' };
  if (r.status === 403) return { ok: false, error: r.code === 'registration_closed' ? 'registration-closed' : 'forbidden' };
  if (r.status === 409) return { ok: false, error: r.code === 'username_taken' ? 'username-taken' : r.code === 'vault_exists' ? 'vault-exists' : 'conflict' };
  if (r.status >= 500) return { ok: false, error: 'server' };
  return { ok: false, error: 'bad-request' };
}

export function createAuth({ store, session, api, deviceName = '', now = () => Date.now() }) {
  // Every vault of the account, downloaded and checked before anything touches the disk (FR07). The vault
  // shown is the oldest one that opens (plan decision 5); broken ones are kept as rows and reported later.
  async function download(token, accountKey) {
    const list = await api.listVaults(token);
    if (!list.ok) return failure(list);
    const rows = [];
    const createdAt = new Map();
    for (const item of list.body.items) {
      const got = await api.getVault(token, item.id);
      if (!got.ok) return failure(got);
      rows.push(syncedVaultRow({ ...item, version: got.body.version, blob: got.body.blob }, now()));
      createdAt.set(item.id, item.createdAt);
    }
    const { vaults } = await unlockWithAccountKey(accountKey, rows.map(toRecord));
    const good = vaults.filter((v) => v.ok).map((v) => v.vaultId);
    const activeVaultId = pickActive(good, createdAt);
    if (!activeVaultId) return { ok: false, error: 'vault-damaged' };
    return { ok: true, rows, activeVaultId };
  }

  const newAccount = (server, username, activeVaultId) => ({
    userId: server.userId,
    username,
    kdf: server.kdf,
    wrappedAccountKey: server.wrappedAccountKey,
    deviceId: newId('device'),
    activeVaultId,
  });

  return {
    // FR03, FR04: the account on this device, with the keys it already has. The password is checked against
    // the local account first, so a wrong one never reaches the server.
    async register({ username, registrationToken, password }) {
      if (usernameError(username)) return { ok: false, error: 'username' };
      const account = await store.readAccount();
      let authKey;
      try {
        const derived = await deriveFromPassword(password, account.kdf);
        await unwrapAccountKey(account.wrappedAccountKey, derived.encKey);
        authKey = derived.authKey;
      } catch {
        return { ok: false, error: 'wrong-password' };
      }
      const row = await store.readVaultRow(session.activeVaultId);
      const sent = row.current.envelope;
      const r = await api.register({
        registrationToken,
        username,
        kdf: account.kdf,
        authKey: toBase64(authKey),
        wrappedAccountKey: account.wrappedAccountKey,
        vault: { id: row.id, wrappedVaultKey: row.wrappedVaultKey, meta: row.meta, blob: sent },
        deviceName,
      });
      zeroize(authKey);
      if (!r.ok) return failure(r);
      await session.markRegistered({
        userId: r.body.userId,
        username,
        session: { token: r.body.token, expiresAt: r.body.expiresAt },
        sent,
        version: r.body.vault.version,
        metaVersion: r.body.vault.metaVersion,
      });
      return { ok: true };
    },

    // FR06–FR09. Results: { ok: true, kind: 'new-device' | 'same' } with the session open, or
    // { ok: false, error }, or { ok: false, choose: { username, risky }, replace(), cancel() } when this device
    // holds another account. Nothing on the device changes before the server has said yes.
    async login({ username, password }) {
      if (usernameError(username)) return { ok: false, error: 'invalid-credentials' };
      const pre = await api.prelogin(username);
      if (!pre.ok) return failure(pre);
      if (!kdfAcceptable(pre.body?.kdf)) return { ok: false, error: 'incompatible' };
      const { encKey, authKey } = await deriveFromPassword(password, pre.body.kdf);
      const r = await api.login({ username, authKey: toBase64(authKey), deviceName });
      zeroize(authKey);
      if (!r.ok) return failure(r);
      const server = r.body;
      const token = server.token;
      const sessionRow = { token, expiresAt: server.expiresAt };
      let accountKey;
      try {
        accountKey = await unwrapAccountKey(server.wrappedAccountKey, encKey);
      } catch {
        await api.logout(token);
        return { ok: false, error: 'incompatible' };
      }

      const local = await store.readAccount();
      if (!local) {
        const got = await download(token, accountKey);
        if (!got.ok) {
          await api.logout(token);
          return got;
        }
        await store.createAccount(newAccount(server, username, got.activeVaultId), got.rows, sessionRow);
        await session.openWith(accountKey);
        return { ok: true, kind: 'new-device' };
      }

      const same = local.userId === server.userId || (local.userId === null && sameBytes(local.wrappedAccountKey, server.wrappedAccountKey));
      if (same) {
        const wasRegistered = local.userId !== null;
        await store.updateAccount({ userId: server.userId, username: local.username ?? username }, sessionRow);
        if (!session.unlocked) await session.openWith(accountKey);
        // Registered, but the answer was lost (AC06): what the server holds is the copy this device sent,
        // so it becomes the base and only the later changes remain to push, without a conflict mark.
        if (!wasRegistered) {
          const list = await api.listVaults(token);
          for (const item of list.ok ? list.body.items : []) {
            const row = await store.readVaultRow(item.id);
            if (!row || row.base !== null || !session.isOpen(item.id)) continue;
            const got = await api.getVault(token, item.id);
            if (got.ok) await session.commitPushed(item.id, got.body.blob, got.body.version).catch(() => {});
          }
        }
        return { ok: true, kind: 'same' };
      }

      const rows = await store.readVaultRows();
      const risky = local.userId === null || rows.some((x) => x.current.dirty);
      return {
        ok: false,
        choose: { username: local.username, risky },
        // FR09 Huỷ: the session just made is ended; nothing on this device changed.
        cancel: () => api.logout(token),
        // FR09 Thay thế: download first, then old account out and new one in, in one transaction (plan
        // decision 4). A failure on the way leaves the old account as it was.
        async replace() {
          const got = await download(token, accountKey);
          if (!got.ok) {
            await api.logout(token);
            return got;
          }
          session.lock();
          await store.replaceAccount(newAccount(server, username, got.activeVaultId), got.rows, sessionRow);
          await session.openWith(accountKey);
          return { ok: true, kind: 'new-device' };
        },
      };
    },

    // FR11: end the session on the server if it can be reached; the one on this device always goes.
    async endSession() {
      const current = await store.readSession();
      let revoked = false;
      if (current?.token) revoked = (await api.logout(current.token)).ok;
      await store.clearSession();
      return { revoked };
    },

    // FR13: everything of the account on this device, in one transaction.
    wipe: () => store.wipe(),
  };
}
