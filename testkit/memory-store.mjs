// In-memory stand-in for store.js, so session logic runs on Node where there is no IndexedDB.
export function memoryStore() {
  let account = null;
  const rows = new Map();
  const s = {
    failWrites: false,
    writes: 0,
    readAccount: async () => account,
    readVaultRows: async () => [...rows.values()].map((r) => structuredClone(r)),
    async createAccount(a, list) {
      if (s.failWrites) throw new Error('write failed');
      if (account) throw new Error('exists');
      account = structuredClone(a);
      for (const r of list) rows.set(r.id, structuredClone(r));
    },
    async writeVaultCurrent(id, envelope, savedAt) {
      if (s.failWrites) throw new Error('write failed');
      s.writes++;
      const r = rows.get(id);
      r.current = { ...r.current, envelope, dirty: true, savedAt };
    },
    get row() {
      return [...rows.values()][0];
    },
    get account() {
      return account;
    },
  };
  return s;
}
