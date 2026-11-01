// Auto-lock after inactivity, and on touch devices after time in the background. Uses wall-clock time:
// timers stop while a machine sleeps or an app is suspended, and performance.now() may stop with them,
// but Date.now() still shows how long it has been.
export const IDLE_MS = 10 * 60 * 1000;
export const CHECK_MS = 1000;

export function createIdleTimer({ onExpire, now = () => Date.now(), timeoutMs = IDLE_MS, backgroundMs = null, setTimer = setInterval, clearTimer = clearInterval }) {
  let last = 0;
  let timer = null;
  let hiddenAt = null;

  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const expired = () => {
    const t = now();
    if (t - last >= timeoutMs) return true;
    return backgroundMs !== null && hiddenAt !== null && t - hiddenAt >= backgroundMs;
  };

  // True if the session is still good. Called before any event is handled, so waking from sleep
  // locks the app before it shows or does anything.
  const check = () => {
    if (timer === null) return true;
    if (!expired()) return true;
    stop();
    onExpire();
    return false;
  };

  return {
    start() {
      stop();
      last = now();
      hiddenAt = null;
      timer = setTimer(check, CHECK_MS);
    },
    stop,
    check,
    activity() {
      if (!check()) return false;
      last = now();
      return true;
    },
    hidden() {
      if (hiddenAt === null) hiddenAt = now();
    },
    // The check comes first: returning late locks before the page is shown again.
    visible() {
      const good = check();
      hiddenAt = null;
      if (good) last = now();
      return good;
    },
    setTimeouts({ idleMs, backgroundMs: bg }) {
      timeoutMs = idleMs;
      backgroundMs = bg;
    },
  };
}
