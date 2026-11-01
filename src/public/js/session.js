// The unlocked state: keys and the plaintext vault live here and nowhere else. Every change goes
// through mutate(), so what the screens show never differs from what reached the disk.
import { createAccount as coreCreateAccount, encryptVault, unlockWithPassword } from './core/crypto.js';
import { KeymeshError } from './core/errors.js';
import { zeroize } from './core/bytes.js';
import { newId, validateVault } from './core/model.js';
import { newVaultRow, toRecord } from './store.js';

export const DEFAULT_VAULT_NAME = 'Vault mặc định';

export class LockedError extends Error {
  constructor() {
    super('Session is locked');
    this.name = 'LockedError';
  }
}

export function createSession({ store, now = () => Date.now() }) {
  let state = null; // { vault, vaultKey, deviceId, meta }
  let queue = Promise.resolve();
  let epoch = 0;

  const open = (entry, deviceId) => {
    state = { vault: entry.vault, vaultKey: entry.vaultKey, meta: entry.meta, deviceId };
  };

  return {
    get unlocked() {
      return state !== null;
    },
    get vault() {
      return state?.vault ?? null;
    },
    get vaultMeta() {
      return state?.meta ?? null;
    },
    get deviceId() {
      return state?.deviceId ?? null;
    },

    hasAccount: async () => (await store.readAccount()) !== null,

    async createAccount(password) {
      const created = await coreCreateAccount(password, { meta: { name: DEFAULT_VAULT_NAME, color: null, order: 0 } });
      zeroize(created.authKey);
      const deviceId = newId('device');
      const account = { userId: null, username: null, kdf: created.kdf, wrappedAccountKey: created.wrappedAccountKey, deviceId };
      await store.createAccount(account, created.records.map((r) => newVaultRow(r, now())));
      open(created.vaults[0], deviceId);
    },

    // Reads the disk every time, so a tab unlocking after another one locks sees the latest data.
    // Throws decrypt-failed for a wrong password; a damaged vault throws with `vaultError` set.
    async unlock(password) {
      const account = await store.readAccount();
      if (!account) throw new KeymeshError('format', 'account');
      const rows = await store.readVaultRows();
      const { vaults } = await unlockWithPassword(password, account.kdf, account.wrappedAccountKey, rows.map(toRecord));
      const entry = vaults[0];
      const failure = !entry ? new KeymeshError('format', 'vault') : !entry.ok ? entry.error : validateVault(entry.vault).ok ? null : new KeymeshError('format', 'vault');
      if (failure) {
        failure.vaultError = true;
        throw failure;
      }
      open(entry, account.deviceId);
    },

    // Runs fn on a copy, encrypts, writes, and only then replaces the vault in memory. One at a time,
    // since each change builds on the result of the one before.
    mutate(fn) {
      const mine = epoch;
      const job = queue.then(async () => {
        if (!state || mine !== epoch) throw new LockedError();
        const copy = structuredClone(state.vault);
        const out = fn(copy, { now: now(), deviceId: state.deviceId });
        const envelope = await encryptVault(copy, state.vaultKey);
        await store.writeVaultCurrent(copy.vaultId, envelope, now());
        if (!state || mine !== epoch) throw new LockedError();
        state.vault = copy;
        return out;
      });
      queue = job.catch(() => {});
      return job;
    },

    lock() {
      epoch++;
      state = null;
    },
  };
}
