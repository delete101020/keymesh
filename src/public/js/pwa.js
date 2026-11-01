// Registers the Service Worker and reports a new version. Nothing reloads until the user chooses to:
// a reload locks the vault and drops whatever is being typed.
export function registerPwa({ onUpdateReady, sw = globalThis.navigator?.serviceWorker, doc = globalThis.document, reload = () => location.reload() }) {
  let reg = null;
  let applying = false;

  const announceWhenInstalled = (worker) => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      // With no controller this is the first install, not a new version.
      if (worker.state === 'installed' && sw.controller) onUpdateReady();
    });
  };

  async function start() {
    if (!sw) return;
    try {
      reg = await sw.register('sw.js');
    } catch {
      return; // Private windows may refuse. The app works the same, only without offline.
    }
    if (reg.waiting && sw.controller) onUpdateReady();
    announceWhenInstalled(reg.installing);
    reg.addEventListener('updatefound', () => announceWhenInstalled(reg.installing));
    // Apps that stay in memory for days never navigate, so nothing else would look for a new version.
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }

  return {
    start,
    // Another tab may already have activated the new version; then there is nothing to wait for.
    apply() {
      if (applying) return;
      applying = true;
      if (!reg?.waiting) return reload();
      sw.addEventListener('controllerchange', reload, { once: true });
      reg.waiting.postMessage('skip-waiting');
    },
  };
}
