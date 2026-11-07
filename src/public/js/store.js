// IndexedDB `keymesh` v1 (docs/03 §3): one database, one row per vault in `vaults`.
const DB_NAME = 'keymesh';
const DB_VERSION = 1;
const META = 'meta';
const VAULTS = 'vaults';
const ACCOUNT_KEY = 'account';
const SESSION_KEY = 'session';
const PASSKEY_KEY = 'passkey';
const SETTINGS_KEY = 'settings';

// Thrown instead of a raw DOMException so callers have one thing to catch. No stored value is ever in it.
export class StoreError extends Error {
  constructor(reason) {
    super(`Storage failed: ${reason}`);
    this.name = 'StoreError';
    this.reason = reason;
  }
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new StoreError(tx.error?.name ?? 'abort'));
    tx.onerror = () => reject(new StoreError(tx.error?.name ?? 'error'));
  });

const result = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StoreError(req.error?.name ?? 'error'));
  });

// The record core/crypto.js reads; KM-006 sends the same pieces to POST /api/register.
export const toRecord = (row) => ({ vaultId: row.id, wrappedVaultKey: row.wrappedVaultKey, meta: row.meta, envelope: row.current.envelope });

export function newVaultRow(record, savedAt) {
  return {
    id: record.vaultId,
    wrappedVaultKey: record.wrappedVaultKey,
    meta: record.meta,
    metaVersion: 0,
    current: { envelope: record.envelope, version: 0, dirty: true, savedAt },
    base: null,
    deletedAt: null,
  };
}

// A row as it comes from the server, already in step with it (FR07, FR27).
export function syncedVaultRow({ id, wrappedVaultKey, meta, metaVersion, version, blob }, savedAt) {
  return {
    id,
    wrappedVaultKey,
    meta,
    metaVersion,
    current: { envelope: blob, version, dirty: false, savedAt },
    base: { envelope: blob, version },
    deletedAt: null,
  };
}

function pushed(row, sent, version, metaVersion) {
  const newer = row.current.envelope.iv !== sent.iv;
  return { ...row, metaVersion, current: { ...row.current, version, dirty: newer }, base: { envelope: sent, version } };
}

export async function openStore(idb = globalThis.indexedDB) {
  if (!idb) throw new StoreError('unavailable');
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(META);
        req.result.createObjectStore(VAULTS, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new StoreError('blocked'));
    });
  } catch (e) {
    throw e instanceof StoreError ? e : new StoreError(e?.name ?? 'open');
  }

  // A throw in `work` aborts the transaction: without this, what was already queued would still commit.
  const inTx = async (stores, mode, work) => {
    try {
      const tx = db.transaction(stores, mode);
      const finished = done(tx);
      try {
        const out = await work(tx);
        await finished;
        return out;
      } catch (e) {
        try {
          tx.abort();
        } catch {
          // Already finished.
        }
        await finished.catch(() => {});
        throw e;
      }
    } catch (e) {
      throw e instanceof StoreError ? e : new StoreError(e?.name ?? 'error');
    }
  };

  return {
    readAccount: () => inTx(META, 'readonly', (tx) => result(tx.objectStore(META).get(ACCOUNT_KEY))).then((a) => a ?? null),

    readVaultRows: () => inTx(VAULTS, 'readonly', (tx) => result(tx.objectStore(VAULTS).getAll())),

    readVaultRow: (id) => inTx(VAULTS, 'readonly', (tx) => result(tx.objectStore(VAULTS).get(id))).then((r) => r ?? null),

    // All or nothing, and `add` makes a second tab racing on setup fail instead of overwriting. `session` is
    // there when the account comes from a login (KM-006 FR07).
    createAccount: (account, rows, session = null) =>
      inTx([META, VAULTS], 'readwrite', (tx) => {
        tx.objectStore(META).add(account, ACCOUNT_KEY);
        if (session) tx.objectStore(META).put(session, SESSION_KEY);
        for (const row of rows) tx.objectStore(VAULTS).add(row);
      }),

    // { token, expiresAt }, or { token: null, needsLogin: true } after a 401. No row: logged out (KM-006).
    readSession: () => inTx(META, 'readonly', (tx) => result(tx.objectStore(META).get(SESSION_KEY))).then((s) => s ?? null),

    writeSession: (session) =>
      inTx(META, 'readwrite', (tx) => {
        tx.objectStore(META).put(session, SESSION_KEY);
      }),

    clearSession: () =>
      inTx(META, 'readwrite', (tx) => {
        tx.objectStore(META).delete(SESSION_KEY);
      }),

    // Only whether one exists: the record itself never leaves this store (KM-006 FR14).
    hasPasskey: () => inTx(META, 'readonly', (tx) => result(tx.objectStore(META).count(PASSKEY_KEY))).then((n) => n > 0),

    updateAccount: (patch, session) =>
      inTx(META, 'readwrite', async (tx) => {
        const store = tx.objectStore(META);
        const account = await result(store.get(ACCOUNT_KEY));
        if (!account) throw new StoreError('missing');
        store.put({ ...account, ...patch }, ACCOUNT_KEY);
        if (session) store.put(session, SESSION_KEY);
      }),

    // A vault the server has and this device does not yet (FR27). `add`: never overwrites one it has.
    addVaultRow: (row) =>
      inTx(VAULTS, 'readwrite', (tx) => {
        tx.objectStore(VAULTS).add(row);
      }),

    // Registration went through (FR04): account, session and the row move to version 1 in one go. The row
    // stays dirty if it was saved again while the request was out, which a different IV shows (FR18).
    commitRegistration: ({ userId, username, session, vaultId, sent, version, metaVersion }) =>
      inTx([META, VAULTS], 'readwrite', async (tx) => {
        const meta = tx.objectStore(META);
        const account = await result(meta.get(ACCOUNT_KEY));
        if (!account) throw new StoreError('missing');
        meta.put({ ...account, userId, username }, ACCOUNT_KEY);
        meta.put(session, SESSION_KEY);
        const vaults = tx.objectStore(VAULTS);
        const row = await result(vaults.get(vaultId));
        if (!row) throw new StoreError('missing');
        vaults.put(pushed(row, sent, version, metaVersion));
      }),

    // A PUT was accepted at `version` (FR18, plan §1).
    commitPush: (id, sent, version) =>
      inTx(VAULTS, 'readwrite', async (tx) => {
        const store = tx.objectStore(VAULTS);
        const row = await result(store.get(id));
        if (!row) throw new StoreError('missing');
        store.put(pushed(row, sent, version, row.metaVersion));
      }),

    // The result of a pull or merge (FR20, FR21): current and base together, so a crash leaves either the
    // old pair or the new one.
    commitPull: (id, { envelope, dirty, base, savedAt }) =>
      inTx(VAULTS, 'readwrite', async (tx) => {
        const store = tx.objectStore(VAULTS);
        const row = await result(store.get(id));
        if (!row) throw new StoreError('missing');
        store.put({ ...row, current: { envelope, version: base.version, dirty, savedAt }, base });
      }),

    // Login with another account (FR09): the old one goes and the new one arrives in one transaction.
    replaceAccount: (account, rows, session) =>
      inTx([META, VAULTS], 'readwrite', (tx) => {
        tx.objectStore(META).clear();
        tx.objectStore(VAULTS).clear();
        tx.objectStore(META).add(account, ACCOUNT_KEY);
        tx.objectStore(META).put(session, SESSION_KEY);
        for (const row of rows) tx.objectStore(VAULTS).add(row);
      }),

    // Everything of the account on this device, in one transaction (FR13). clear() is not blocked by other
    // tabs' connections the way deleteDatabase() is; they just read empty stores afterwards.
    wipe: () =>
      inTx([META, VAULTS], 'readwrite', (tx) => {
        tx.objectStore(META).clear();
        tx.objectStore(VAULTS).clear();
      }),

    // Resolves only after the transaction has committed.
    writeVaultCurrent: (id, envelope, savedAt) =>
      inTx(VAULTS, 'readwrite', async (tx) => {
        const store = tx.objectStore(VAULTS);
        const row = await result(store.get(id));
        if (!row) throw new StoreError('missing');
        store.put({ ...row, current: { ...row.current, envelope, dirty: true, savedAt } });
      }),

    readSettings: () => inTx(META, 'readonly', (tx) => result(tx.objectStore(META).get(SETTINGS_KEY))).then((s) => s ?? null),

    writeSettings: (settings) =>
      inTx(META, 'readwrite', (tx) => {
        tx.objectStore(META).put(settings, SETTINGS_KEY);
      }),

    close: () => db.close(),
  };
}
