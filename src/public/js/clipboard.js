// Copy with auto-clear (FR40, docs/04). Reading the clipboard is only attempted when permission is
// already granted: asking would pop up a prompt while the secret stays on the clipboard.
export const CLEAR_AFTER_MS = 30 * 1000;

export function createClipboardGuard({
  clipboard = globalThis.navigator?.clipboard,
  permissions = globalThis.navigator?.permissions,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  clearAfterMs = CLEAR_AFTER_MS,
  ClipboardItemClass = globalThis.ClipboardItem,
  onRetryChange = () => {},
} = {}) {
  let held = null; // the value last copied, kept only while a clear is due
  let timer = null;
  let retryPending = false; // a clear was refused: WebKit refuses any write outside a user gesture
  let copies = 0;

  function setRetry(pending) {
    if (pending === retryPending) return;
    retryPending = pending;
    onRetryChange(pending);
  }

  // WebKit drops the user gesture at the first await, so a value that takes time to compute has to
  // go through a ClipboardItem, which is created inside the gesture and takes a promise.
  async function write(value) {
    if (typeof value === 'string') {
      await clipboard.writeText(value);
      return value;
    }
    if (ClipboardItemClass && clipboard.write) {
      try {
        const blob = value.then((v) => new Blob([v], { type: 'text/plain' }));
        await clipboard.write([new ClipboardItemClass({ 'text/plain': blob })]);
        return await value;
      } catch {
        // Older ClipboardItem without promises; writeText below is refused too if the cause was the gesture.
      }
    }
    const plain = await value;
    await clipboard.writeText(plain);
    return plain;
  }

  async function canRead() {
    try {
      return (await permissions.query({ name: 'clipboard-read' })).state === 'granted';
    } catch {
      return false;
    }
  }

  // Something else was copied since? Then the clipboard is no longer ours to clear.
  async function replacedByUser(value) {
    if (value === null || !(await canRead())) return false;
    try {
      return (await clipboard.readText()) !== value;
    } catch {
      return false;
    }
  }

  async function clear() {
    const value = held;
    const startedAt = copies;
    if (await replacedByUser(value)) {
      if (startedAt === copies) {
        held = null;
        retryPending = false; // nothing was cleared, so there is nothing to tell
      }
      return;
    }
    if (startedAt !== copies) return;
    try {
      await clipboard.writeText('');
      if (startedAt === copies) {
        held = null;
        setRetry(false);
      }
    } catch {
      // Refused: no focus, or no user gesture (WebKit). retry() tries again.
      if (startedAt === copies) setRetry(true);
    }
  }

  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  return {
    // True when the value reached the clipboard. A new copy replaces the count of the previous one.
    // `value` is a string, or a promise of one that was started inside the user gesture.
    async copy(value) {
      // Everything a pending clear looks at changes before the first await: this copy may be the very
      // tap that triggers retry(), and that clear must not land after this write.
      const mine = ++copies;
      cancelTimer();
      retryPending = false;
      let plain;
      try {
        plain = await write(value);
      } catch {
        if (mine === copies && held !== null) setRetry(true);
        return false;
      }
      if (mine !== copies) return true;
      held = plain;
      timer = setTimer(() => {
        timer = null;
        clear();
      }, clearAfterMs);
      return true;
    },

    // Call on focus and on every user gesture.
    retry() {
      return retryPending ? clear() : Promise.resolve();
    },

    // On lock: try now, and drop the value whatever the result. A retry after that has no value to
    // compare against, so it overwrites.
    async lockNow() {
      cancelTimer();
      if (held === null) return;
      const attempt = clear();
      held = null;
      await attempt;
    },

    get holdsValue() {
      return held !== null;
    },
  };
}
