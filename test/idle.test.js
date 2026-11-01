import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleTimer, IDLE_MS } from '../src/public/js/idle.js';

function rig() {
  let t = 1000;
  let tick = null;
  let expired = 0;
  const timer = createIdleTimer({
    onExpire: () => expired++,
    now: () => t,
    setTimer: (fn) => ((tick = fn), 1),
    clearTimer: () => (tick = null),
  });
  return { timer, advance: (ms) => (t += ms), tick: () => tick?.(), get expired() { return expired; }, get running() { return tick !== null; } };
}
const MIN = 60 * 1000;

test('KM-003 AC09 FR11 locks at the 10-minute mark, within one tick', () => {
  assert.equal(IDLE_MS, 10 * MIN);
  const r = rig();
  r.timer.start();
  r.advance(10 * MIN - 1);
  r.tick();
  assert.equal(r.expired, 0);
  r.advance(1);
  r.tick();
  assert.equal(r.expired, 1);
  assert.equal(r.running, false);
});

test('KM-003 AC09 FR11 activity at minute 9 restarts the count from there', () => {
  const r = rig();
  r.timer.start();
  r.advance(9 * MIN);
  assert.equal(r.timer.activity(), true);
  r.advance(9 * MIN);
  r.tick();
  assert.equal(r.expired, 0);
  r.advance(1 * MIN);
  r.tick();
  assert.equal(r.expired, 1);
});

test('KM-003 AC10 FR11 after a sleep no tick ran: the first event locks before it is handled', () => {
  const r = rig();
  r.timer.start();
  r.advance(11 * MIN);
  assert.equal(r.expired, 0);
  assert.equal(r.timer.activity(), false);
  assert.equal(r.expired, 1);
  assert.equal(r.timer.activity(), true); // Stopped: later events do not expire it twice.
  assert.equal(r.expired, 1);
});

test('KM-003 FR12 a stopped timer never fires', () => {
  const r = rig();
  r.timer.start();
  r.timer.stop();
  r.advance(60 * MIN);
  assert.equal(r.timer.check(), true);
  assert.equal(r.expired, 0);
});
