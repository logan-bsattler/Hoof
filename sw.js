// Service worker: precaches the app shell so TRUE HOOF installs and plays offline.
// Network-first, so a reachable server always wins and dev edits show up on reload;
// the cache is the fallback when offline or slow. Bump VERSION when the asset list changes.
const VERSION = 'true-hoof-v54';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'src/audio.js', 'src/case.js', 'src/conditions.js', 'src/config.js', 'src/hoof.js', 'src/hoofart.js',
  'src/guide.js', 'src/main.js', 'src/noise.js', 'src/particles.js', 'src/render.js', 'src/route.js', 'src/save.js', 'src/scenery.js', 'src/seasonart.js', 'src/view.js',
  'src/scoring.js', 'src/stance.js', 'src/steps.js', 'src/toolart.js', 'src/tools.js', 'src/tutorial.js',
  'src/ui.js', 'src/walkoff.js',
  'assets/guide/routine.png', 'assets/guide/ulcer.png', 'assets/guide/whiteline.png', 'assets/guide/puncture.png', 'assets/guide/toenecrosis.png',
  'assets/guide/doublesole.png', 'assets/guide/twoclaw.png', 'assets/guide/dd.png', 'assets/guide/footrot.png', 'assets/guide/nonfoot.png', 'assets/guide/thinsole.png', 'assets/guide/dds.png',
  'audio/brush.mp3', 'audio/clunk.mp3', 'audio/grinder.mp3', 'audio/knife1.mp3',
  'audio/knife2.mp3', 'audio/knife3.mp3', 'audio/moo-flinch.mp3', 'audio/moo.mp3',
  'audio/rasp.mp3', 'audio/sigh.mp3', 'audio/snip.mp3', 'audio/snort.mp3', 'audio/spray.mp3',
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

// A hung network (captive Wi-Fi, one bar) never fails fast: after this long, serve the cached
// copy and let the fetch finish in the background to refresh the cache.
const NETWORK_TIMEOUT = 2500; // ms

const cached = (req) => caches.match(req, { ignoreSearch: true })
  .then((hit) => hit ?? (req.mode === 'navigate' ? caches.match('index.html') : undefined));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const net = fetch(req);
  // Registered now, while the event is live: on the timeout path the network answer lands after
  // respondWith has settled, and a waitUntil called that late is dropped.
  e.waitUntil(net.then((res) => {
    if (!res.ok) return undefined;
    const copy = res.clone();
    return caches.open(VERSION).then((c) => c.put(req, copy));
  }).catch(() => {}));
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT)).then(() => cached(req));
  e.respondWith(new Promise((resolve, reject) => {
    let settled = false;
    const done = (res) => { if (!settled && res) { settled = true; resolve(res); } };
    net.then(done, () => cached(req).then((hit) => {
      if (hit) done(hit); else if (!settled) { settled = true; reject(new TypeError('offline')); }
    }));
    // Timed out with a cached copy: use it. With none, keep waiting on the network.
    slow.then(done);
  }));
});
