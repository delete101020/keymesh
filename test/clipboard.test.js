import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipboardGuard, CLEAR_AFTER_MS } from '../src/public/js/clipboard.js';

function rig({ read = 'granted', refuseWrite = false, ClipboardItemClass } = {}) {
  const r = {
    content: 'before',
    refuseWrite,
    readState: read,
    writes: [],
    timers: new Map(),
    seq: 0,
    readCalls: 0,
    retryChanges: [],
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
      async write([item]) {
        if (r.refuseWrite) throw new Error('NotAllowedError');
        r.content = await (await item.parts['text/plain']).text();
        r.writes.push(r.content);
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
    ClipboardItemClass,
    onRetryChange: (pending) => r.retryChanges.push(pending),
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
  await r.guard.retry();
  assert.equal(r.content, 'secret');
  r.refuseWrite = false;
  await r.guard.retry();
  assert.equal(r.content, '');
  r.content = 'later';
  await r.guard.retry();
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
  await r.guard.retry();
  assert.equal(r.content, '');
});

test('KM-003 FR12 lock with nothing pending leaves the clipboard alone', async () => {
  const r = rig();
  await r.guard.lockNow();
  assert.equal(r.content, 'before');
  assert.deepEqual(r.writes, []);
});

// WebKit, seen on iOS 18.6: writeText outside a user gesture is always refused, and so is a write after an await.
test('KM-004 AC01 clear refused at 30 seconds: the owner hears once, the next gesture clears it and they hear that too', async () => {
  const r = rig();
  await r.guard.copy('secret');
  r.refuseWrite = true;
  await r.fire();
  assert.equal(r.content, 'secret');
  await r.guard.retry();
  assert.deepEqual(r.retryChanges, [true]);
  r.refuseWrite = false;
  await r.guard.retry();
  assert.equal(r.content, '');
  assert.deepEqual(r.retryChanges, [true, false]);
  r.content = 'later';
  await r.guard.retry();
  assert.equal(r.content, 'later');
});

test('KM-004 AC01 nothing refused: a gesture never touches the clipboard', async () => {
  const r = rig();
  await r.guard.copy('secret');
  await r.guard.retry();
  assert.equal(r.content, 'secret');
  await r.fire();
  r.content = 'later';
  await r.guard.retry();
  assert.equal(r.content, 'later');
  assert.deepEqual(r.retryChanges, []);
});

test('KM-004 AC01 the tap that retries is itself a copy: the new value stays and gets its own count', async () => {
  const r = rig({ read: 'denied' });
  await r.guard.copy('old');
  r.refuseWrite = true;
  await r.fire();
  r.refuseWrite = false;
  // The order on a real tap: gesture listener in capture, then the button's handler, same task.
  const retried = r.guard.retry();
  const copied = r.guard.copy('new');
  await Promise.all([retried, copied]);
  await new Promise((x) => setTimeout(x));
  assert.equal(r.content, 'new');
  assert.equal(r.timers.size, 1);
  await r.fire();
  assert.equal(r.content, '');
});

test('KM-004 AC01 a copy refused while a clear was due: the old value is still retried', async () => {
  const r = rig();
  await r.guard.copy('old');
  r.refuseWrite = true;
  assert.equal(await r.guard.copy('new'), false);
  assert.equal(r.timers.size, 0);
  assert.deepEqual(r.retryChanges, [true]);
  r.refuseWrite = false;
  await r.guard.retry();
  assert.equal(r.content, '');
});

class FakeItem {
  constructor(parts) {
    this.parts = parts;
  }
}

test('KM-004 AC01 a value still being computed goes through a ClipboardItem, started before it resolves', async () => {
  const r = rig({ ClipboardItemClass: FakeItem });
  let resolve;
  const copied = r.guard.copy(new Promise((x) => (resolve = x)));
  resolve('123456');
  assert.equal(await copied, true);
  assert.equal(r.content, '123456');
  assert.equal(r.guard.holdsValue, true);
  await r.fire();
  assert.equal(r.content, '');
});

test('KM-004 AC01 no ClipboardItem: a promised value falls back to writeText', async () => {
  const r = rig();
  assert.equal(await r.guard.copy(Promise.resolve('123456')), true);
  assert.equal(r.content, '123456');
});

test('KM-004 AC01 refused, then replaced by something else: left alone, and not reported as cleared', async () => {
  const r = rig();
  await r.guard.copy('secret');
  r.refuseWrite = true;
  await r.fire();
  r.refuseWrite = false;
  r.content = 'other';
  await r.guard.retry();
  assert.equal(r.content, 'other');
  assert.deepEqual(r.retryChanges, [true]);
});
