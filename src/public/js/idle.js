// Auto-lock after inactivity. Uses wall-clock time: timers stop while a machine sleeps, and
// performance.now() may stop with them, but Date.now() still shows how long it has been.
export const IDLE_MS = 10 * 60 * 1000;
export const CHECK_MS = 1000;

export function createIdleTimer({ onExpire, now = () => Date.now(), timeoutMs = IDLE_MS, setTimer = setInterval, clearTimer = clearInterval }) {
  let last = 0;
  let timer = null;

  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  // True if the session is still good. Called before any event is handled, so waking from sleep
  // locks the app before it shows or does anything.
  const check = () => {
    if (timer === null) return true;
    if (now() - last < timeoutMs) return true;
    stop();
    onExpire();
    return false;
  };

  return {
    start() {
      stop();
      last = now();
      timer = setTimer(check, CHECK_MS);
    },
    stop,
    check,
    activity() {
      if (!check()) return false;
      last = now();
      return true;
    },
  };
}
