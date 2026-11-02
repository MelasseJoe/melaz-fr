'use strict';
// Le cache ne contient que la page hors ligne et les icônes publiques.
// Aucun HTML connecté, appel API, cookie ou donnée utilisateur n'est enregistré ici.
const ROOT = new URL(self.registration.scope);
const PREFIX = `melaz-public:${ROOT.pathname}:`;
const CACHE = `${PREFIX}20261102-1`;
const OFFLINE = new URL('offline.html', ROOT).href;
const PUBLIC_ASSETS = ['offline.html', 'assets/pwa/icon-192.png', 'assets/pwa/icon-512.png', 'assets/pwa/apple-touch-icon.png'].map(path => new URL(path, ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PUBLIC_ASSETS.map(url => new Request(url, { cache: 'reload', credentials: 'omit' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  // Les API restent strictement en ligne, même lorsqu'elles sont ouvertes directement.
  if (url.pathname.startsWith(new URL('auth/', ROOT).pathname) || url.pathname.endsWith('/api.php')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request, { cache: 'no-store' }); }
      catch {
        const cache = await caches.open(CACHE);
        return await cache.match(OFFLINE) || new Response('Connexion internet nécessaire. Réessaie dans un instant.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
    })());
    return;
  }
  if (!PUBLIC_ASSETS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(request) || fetch(request);
  })());
});
