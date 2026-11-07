// In-memory stand-in for store.js, so session, auth and sync logic run on Node where there is no IndexedDB.
// Same all-or-nothing behaviour: a failing write changes nothing. `failWrites` fails every write; `failOn`
// names methods that fail (KM-006: a crash between steps of a login or a push).
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

function pushed(row, sent, version, metaVersion) {
  const newer = row.current.envelope.iv !== sent.iv;
  return { ...row, metaVersion, current: { ...row.current, version, dirty: newer }, base: { envelope: sent, version } };
}

export function memoryStore() {
  let account = null;
  let session = null;
  let passkey = null;
  let settings = null;
  const rows = new Map();
  const s = {
    failWrites: false,
    failOn: new Set(),
    writes: 0,
    calls: [],
    check(name) {
      s.calls.push(name);
      if (s.failWrites || s.failOn.has(name)) throw new Error('write failed');
    },
    readAccount: async () => clone(account),
    readVaultRows: async () => [...rows.values()].map(clone),
    readVaultRow: async (id) => clone(rows.get(id) ?? null),
    async createAccount(a, list, sess = null) {
      s.check('createAccount');
      if (account) throw new Error('exists');
      account = clone(a);
      if (sess) session = clone(sess);
      for (const r of list) rows.set(r.id, clone(r));
    },
    async writeVaultCurrent(id, envelope, savedAt) {
      s.check('writeVaultCurrent');
      s.writes++;
      const r = rows.get(id);
      if (!r) throw new Error('missing');
      rows.set(id, { ...r, current: { ...r.current, envelope, dirty: true, savedAt } });
    },
    readSession: async () => clone(session),
    async writeSession(x) {
      s.check('writeSession');
      session = clone(x);
    },
    async clearSession() {
      s.check('clearSession');
      session = null;
    },
    hasPasskey: async () => passkey !== null,
    async updateAccount(patch, sess) {
      s.check('updateAccount');
      if (!account) throw new Error('missing');
      account = { ...account, ...clone(patch) };
      if (sess) session = clone(sess);
    },
    async addVaultRow(row) {
      s.check('addVaultRow');
      if (rows.has(row.id)) throw new Error('exists');
      rows.set(row.id, clone(row));
    },
    async commitRegistration({ userId, username, session: sess, vaultId, sent, version, metaVersion }) {
      s.check('commitRegistration');
      const r = rows.get(vaultId);
      if (!account || !r) throw new Error('missing');
      account = { ...account, userId, username };
      session = clone(sess);
      rows.set(vaultId, pushed(r, clone(sent), version, metaVersion));
    },
    async commitPush(id, sent, version) {
      s.check('commitPush');
      const r = rows.get(id);
      if (!r) throw new Error('missing');
      rows.set(id, pushed(r, clone(sent), version, r.metaVersion));
    },
    async commitPull(id, { envelope, dirty, base, savedAt }) {
      s.check('commitPull');
      const r = rows.get(id);
      if (!r) throw new Error('missing');
      rows.set(id, { ...r, current: { envelope: clone(envelope), version: base.version, dirty, savedAt }, base: clone(base) });
    },
    async replaceAccount(a, list, sess) {
      s.check('replaceAccount');
      account = clone(a);
      session = clone(sess);
      passkey = null;
      settings = null;
      rows.clear();
      for (const r of list) rows.set(r.id, clone(r));
    },
    async wipe() {
      s.check('wipe');
      account = null;
      session = null;
      passkey = null;
      settings = null;
      rows.clear();
    },
    readSettings: async () => clone(settings),
    async writeSettings(x) {
      s.check('writeSettings');
      settings = clone(x);
    },
    // Test setup only: a passkey record as KM-007 would write it.
    setPasskey(x) {
      passkey = clone(x);
    },
    get row() {
      return [...rows.values()][0];
    },
    rowOf: (id) => rows.get(id),
    get rows() {
      return [...rows.values()];
    },
    get account() {
      return account;
    },
    get session() {
      return session;
    },
  };
  return s;
}
