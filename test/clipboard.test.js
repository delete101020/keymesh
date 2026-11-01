import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipboardGuard, CLEAR_AFTER_MS } from '../src/public/js/clipboard.js';

function rig({ read = 'granted', refuseWrite = false } = {}) {
  const r = {
    content: 'before',
    refuseWrite,
    readState: read,
    writes: [],
    timers: new Map(),
    seq: 0,
    readCalls: 0,
    async fire() {
      const pending = [...r.timers.values()];
      r.timers.clear();
      for (const fn of pending) fn();
      await new Promise((x) => setTimeout(x));
    },
  };
  r.guard = createClipboardGuard({
    clipboard: {
      async writeText(v) {
        if (r.refuseWrite) throw new Error('NotAllowedError');
        r.content = v;
        r.writes.push(v);
      },
      async readText() {
        r.readCalls++;
        if (r.readState === 'throws') throw new Error('NotAllowedError');
        return r.content;
      },
    },
    permissions: {
      async query() {
        if (r.readState === 'query-throws') throw new Error('TypeError');
        return { state: r.readState === 'throws' ? 'granted' : r.readState };
      },
    },
    setTimer: (fn, ms) => {
      assert.equal(ms, CLEAR_AFTER_MS);
      r.timers.set(++r.seq, fn);
      return r.seq;
    },
    clearTimer: (id) => r.timers.delete(id),
  });
  return r;
}

test('KM-003 AC36 FR40 clipboard unchanged after 30 seconds: cleared', async () => {
  assert.equal(CLEAR_AFTER_MS, 30000);
  const r = rig();
  assert.equal(await r.guard.copy('secret'), true);
  assert.equal(r.content, 'secret');
  await r.fire();
  assert.equal(r.content, '');
  assert.equal(r.guard.holdsValue, false);
});

test('KM-003 AC36 FR40 something else copied and clipboard readable: left alone', async () => {
  const r = rig();
  await r.guard.copy('secret');
  r.content = 'from another app';
  await r.fire();
  assert.equal(r.content, 'from another app');
  assert.equal(r.guard.holdsValue, false);
});

test('KM-003 AC36 FR40 clipboard not readable: overwritten anyway, without ever prompting', async () => {
  for (const readState of ['prompt', 'denied', 'query-throws', 'throws']) {
    const r = rig({ read: readState });
    await r.guard.copy('secret');
    r.content = 'something else';
    await r.fire();
    assert.equal(r.content, '', readState);
    if (readState !== 'throws') assert.equal(r.readCalls, 0, readState);
  }
});

test('KM-003 AC36 FR40 copying again restarts the count', async () => {
  const r = rig();
  await r.guard.copy('one');
  await r.guard.copy('two');
  assert.equal(r.timers.size, 1);
  await r.fire();
  assert.equal(r.content, '');
});

test('KM-003 AC36 FR40 a write refused for lack of focus is retried when focus returns', async () => {
  const r = rig();
  await r.guard.copy('secret');
  r.refuseWrite = true;
  await r.fire();
  assert.equal(r.content, 'secret');
  await r.guard.focused();
  assert.equal(r.content, 'secret');
  r.refuseWrite = false;
  await r.guard.focused();
  assert.equal(r.content, '');
  r.content = 'later';
  await r.guard.focused();
  assert.equal(r.content, 'later');
});

test('KM-003 FR40 a refused copy reports false and starts no count', async () => {
  const r = rig({ refuseWrite: true });
  assert.equal(await r.guard.copy('secret'), false);
  assert.equal(r.timers.size, 0);
  assert.equal(r.guard.holdsValue, false);
});

test('KM-003 AC37 FR12 lock during the count: cleared now, no value kept', async () => {
  const r = rig();
  await r.guard.copy('secret');
  await r.guard.lockNow();
  assert.equal(r.content, '');
  assert.equal(r.timers.size, 0);
  assert.equal(r.guard.holdsValue, false);
});

test('KM-003 AC37 FR12 lock with the write refused: no value kept, cleared when focus returns', async () => {
  const r = rig();
  await r.guard.copy('secret');
  r.refuseWrite = true;
  await r.guard.lockNow();
  assert.equal(r.guard.holdsValue, false);
  assert.equal(r.content, 'secret');
  r.refuseWrite = false;
  await r.guard.focused();
  assert.equal(r.content, '');
});

test('KM-003 FR12 lock with nothing pending leaves the clipboard alone', async () => {
  const r = rig();
  await r.guard.lockNow();
  assert.equal(r.content, 'before');
  assert.deepEqual(r.writes, []);
});
