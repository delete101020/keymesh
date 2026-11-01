// App shell only: a fixed list cached at install, nothing cached at runtime, /api/* never touched.
// What is not cached cannot leak. VERSION and SHELL are written by `npm run sw-version`; npm test fails if they are stale.
const VERSION = '367be12f68449bc2';
const SHELL = [
  './',
  'icons/apple-touch-icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'js/app.js',
  'js/clipboard.js',
  'js/core/bytes.js',
  'js/core/crypto.js',
  'js/core/errors.js',
  'js/core/merge.js',
  'js/core/model.js',
  'js/field-file.js',
  'js/history-diff.js',
  'js/idle.js',
  'js/otp.js',
  'js/passgen.js',
  'js/pwa.js',
  'js/session.js',
  'js/settings.js',
  'js/store.js',
  'js/tab-lock.js',
  'js/ui/detail.js',
  'js/ui/dom.js',
  'js/ui/edit.js',
  'js/ui/gate.js',
  'js/ui/generator-dialog.js',
  'js/ui/history-dialog.js',
  'js/ui/home.js',
  'js/ui/icons.js',
  'js/ui/list.js',
  'js/ui/nav-history.js',
  'js/ui/nav.js',
  'js/ui/project-dialogs.js',
  'js/ui/qr-dialog.js',
  'js/ui/settings-dialog.js',
  'js/ui/shell.js',
  'js/vault-ops.js',
  'js/vault-query.js',
  'js/wordlist.js',
  'manifest.webmanifest',
  'styles.css',
];

const PREFIX = 'keymesh-shell-';
const CACHE = PREFIX + VERSION;

self.addEventListener('install', (e) => {
  // `reload` skips the HTTP cache, so a new version never stores an old file under its name.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// A new version waits until the user chooses to reload; see js/pwa.js.
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

async function fromShell(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.mode === 'navigate' ? './' : request, { ignoreSearch: request.mode === 'navigate' });
  return hit ?? fetch(request);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fromShell(e.request));
});
