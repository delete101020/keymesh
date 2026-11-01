// Copy with auto-clear (FR40, docs/04). Reading the clipboard is only attempted when permission is
// already granted: asking would pop up a prompt while the secret stays on the clipboard.
export const CLEAR_AFTER_MS = 30 * 1000;

export function createClipboardGuard({
  clipboard = globalThis.navigator?.clipboard,
  permissions = globalThis.navigator?.permissions,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  clearAfterMs = CLEAR_AFTER_MS,
} = {}) {
  let held = null; // the value last copied, kept only while a clear is due
  let timer = null;
  let retryOnFocus = false;
  let copies = 0;

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
        retryOnFocus = false;
      }
      return;
    }
    if (startedAt !== copies) return;
    try {
      await clipboard.writeText('');
      if (startedAt === copies) {
        held = null;
        retryOnFocus = false;
      }
    } catch {
      // Refused because the tab has no focus; focused() tries again.
      if (startedAt === copies) retryOnFocus = true;
    }
  }

  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  return {
    // True when the value reached the clipboard. A new copy replaces the count of the previous one.
    async copy(value) {
      try {
        await clipboard.writeText(value);
      } catch {
        return false;
      }
      copies++;
      cancelTimer();
      held = value;
      retryOnFocus = false;
      timer = setTimer(() => {
        timer = null;
        clear();
      }, clearAfterMs);
      return true;
    },

    focused() {
      return retryOnFocus ? clear() : Promise.resolve();
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
