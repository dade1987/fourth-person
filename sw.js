// sw.js — PWA installabile, e soprattutto funzionante offline (SPEC §2).
// Il gioco base sta sotto i 2 MB: si può mettere tutto in cache al primo colpo.

const VERSION = 'quarta-persona-v2';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'src/main.js',
  'src/math4d/rotor.js',
  'src/math4d/bivector.js',
  'src/math4d/wedge.js',
  'src/math4d/polytope.js',
  'src/math4d/rigidbody.js',
  'src/math4d/collide.js',
  'src/math4d/knots.js',
  'src/math4d/orbit.js',
  'src/render/gl.js',
  'src/render/project.js',
  'src/render/glass.js',
  'src/render/holo.js',
  'src/render/shadow.js',
  'src/render/slice.js',
  'src/render/wiggle.js',
  'src/render/headcoupled.js',
  'src/render/renderer.js',
  'src/audio/drone.js',
  'src/capture/clip.js',
  'src/game/world.js',
  'src/game/shapes.js',
  'src/game/npc.js',
  'src/game/puzzles/sealedbox.js',
  'src/game/puzzles/rings.js',
  'src/game/puzzles/hand.js',
  'src/onboarding/coldopen.js',
  'src/onboarding/chapters.js',
  'src/onboarding/voice.js',
  'src/onboarding/labs.js',
  'src/render/bloom.js',
  'src/render/backdrop.js',
  'src/ui/hud.js',
  'src/ui/controls.js',
  'src/ui/compass.js',
  'src/i18n/it.json',
  'src/i18n/en.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request)
        .then((res) => {
          if (res.ok && new URL(e.request.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('index.html'));
    })
  );
});
