// One unlocked tab per browser (FR13). A Web Lock frees itself when its tab dies, so a crash cannot
// leave the app locked out, unlike a flag in storage or a BroadcastChannel handshake.
export const LOCK_NAME = 'keymesh-unlocked';

// Returns a release function, or null when another tab holds the lock.
export function acquireTabLock(locks = globalThis.navigator?.locks) {
  return new Promise((resolve, reject) => {
    locks
      .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return undefined;
        }
        return new Promise((release) => resolve(release));
      })
      .catch(reject);
  });
}
