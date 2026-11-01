import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleTimer, IDLE_MS } from '../src/public/js/idle.js';

function rig(options = {}) {
  let t = 1000;
  let tick = null;
  let expired = 0;
  const timer = createIdleTimer({
    onExpire: () => expired++,
    now: () => t,
    setTimer: (fn) => ((tick = fn), 1),
    clearTimer: () => (tick = null),
    ...options,
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

const SEC = 1000;

test('KM-004 AC06 touch: 59 seconds in the background stays open, 60 locks', () => {
  const r = rig({ backgroundMs: 60 * SEC });
  r.timer.start();
  r.timer.hidden();
  r.advance(59 * SEC);
  r.tick();
  assert.equal(r.expired, 0);
  assert.equal(r.timer.visible(), true);
  assert.equal(r.expired, 0);
  r.timer.hidden();
  r.advance(60 * SEC);
  r.tick();
  assert.equal(r.expired, 1);
});

test('KM-004 AC06 timers stopped while in the background: coming back locks before anything shows', () => {
  const r = rig({ backgroundMs: 60 * SEC });
  r.timer.start();
  r.timer.hidden();
  r.advance(61 * SEC); // no tick, as in a suspended app
  assert.equal(r.expired, 0);
  assert.equal(r.timer.visible(), false);
  assert.equal(r.expired, 1);
});

test('KM-004 AC06 time before going to the background and after coming back does not add up', () => {
  const r = rig({ backgroundMs: 60 * SEC });
  r.timer.start();
  r.advance(50 * SEC);
  r.timer.hidden();
  r.advance(50 * SEC);
  assert.equal(r.timer.visible(), true);
  r.timer.hidden();
  r.advance(50 * SEC);
  assert.equal(r.timer.visible(), true);
  assert.equal(r.expired, 0);
});

test('KM-004 AC06 computers have no background lock: switching tab for an hour alone does not lock past the idle rule', () => {
  const r = rig({ timeoutMs: 120 * MIN });
  r.timer.start();
  r.timer.hidden();
  r.advance(60 * MIN);
  r.tick();
  assert.equal(r.expired, 0);
  assert.equal(r.timer.visible(), true);
});

test('KM-004 AC06 the idle rule still applies on a touch device, and to a computer in another tab', () => {
  const touch = rig({ backgroundMs: 60 * SEC });
  touch.timer.start();
  touch.advance(10 * MIN);
  touch.tick();
  assert.equal(touch.expired, 1);
  const desk = rig();
  desk.timer.start();
  desk.timer.hidden();
  desk.advance(10 * MIN);
  assert.equal(desk.timer.visible(), false);
});

test('KM-004 AC07 a changed timeout takes effect on the running timer', () => {
  const r = rig();
  r.timer.start();
  r.timer.setTimeouts({ idleMs: 1 * MIN, backgroundMs: null });
  r.advance(1 * MIN);
  r.tick();
  assert.equal(r.expired, 1);
});
