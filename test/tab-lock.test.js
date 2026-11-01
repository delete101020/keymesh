import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireTabLock, LOCK_NAME } from '../src/public/js/tab-lock.js';

// Behaves like LockManager.request with ifAvailable for a single lock name.
function fakeLocks() {
  let held = false;
  return {
    requests: [],
    async request(name, options, cb) {
      this.requests.push({ name, options });
      if (held) return cb(null);
      held = true;
      await cb({ name });
      held = false;
      return undefined;
    },
  };
}

test('KM-003 AC11 FR13 only one holder at a time; releasing lets the next one in', async () => {
  const locks = fakeLocks();
  const releaseA = await acquireTabLock(locks);
  assert.equal(typeof releaseA, 'function');
  assert.equal(await acquireTabLock(locks), null);
  assert.deepEqual(locks.requests[0], { name: LOCK_NAME, options: { ifAvailable: true } });
  releaseA();
  await new Promise((r) => setTimeout(r));
  const releaseB = await acquireTabLock(locks);
  assert.equal(typeof releaseB, 'function');
  releaseB();
});

test('KM-003 AC11 FR13 real Web Locks, where the platform has them', { skip: !globalThis.navigator?.locks }, async () => {
  const release = await acquireTabLock();
  assert.equal(await acquireTabLock(), null);
  release();
  await new Promise((r) => setTimeout(r, 20));
  const again = await acquireTabLock();
  assert.equal(typeof again, 'function');
  again();
});
