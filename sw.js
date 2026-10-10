// Service worker: precaches the app shell so TRUE HOOF installs and plays offline.
// Network-first, so a reachable server always wins and dev edits show up on reload;
// the cache is the fallback when offline. Bump VERSION when the asset list changes.
const VERSION = 'true-hoof-v2';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'src/audio.js', 'src/case.js', 'src/config.js', 'src/hoof.js', 'src/hoofart.js',
  'src/main.js', 'src/noise.js', 'src/particles.js', 'src/render.js', 'src/scenery.js',
  'src/scoring.js', 'src/steps.js', 'src/toolart.js', 'src/tools.js', 'src/tutorial.js',
  'src/ui.js', 'src/walkoff.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit ?? (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
