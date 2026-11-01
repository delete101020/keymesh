// IndexedDB `keymesh` v1 (docs/03 §3): one database, one row per vault in `vaults`.
const DB_NAME = 'keymesh';
const DB_VERSION = 1;
const META = 'meta';
const VAULTS = 'vaults';
const ACCOUNT_KEY = 'account';
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

    // All or nothing, and `add` makes a second tab racing on setup fail instead of overwriting.
    createAccount: (account, rows) =>
      inTx([META, VAULTS], 'readwrite', (tx) => {
        tx.objectStore(META).add(account, ACCOUNT_KEY);
        for (const row of rows) tx.objectStore(VAULTS).add(row);
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
