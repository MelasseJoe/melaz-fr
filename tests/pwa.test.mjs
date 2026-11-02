import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const source = await fs.readFile(new URL('sw.js', root), 'utf8');
function worker({ offline = false } = {}) {
  const handlers = new Map(), entries = new Map(), fetched = [], deleted = [];
  let precached = [], claimed = false;
  const cache = {
    async addAll(requests) { precached = requests; for (const request of requests) entries.set(request.url, new Response(request.url.endsWith('offline.html') ? 'OFFLINE PUBLIC' : 'ICON PUBLIC')); },
    async match(request) { return entries.get(typeof request === 'string' ? request : request.url)?.clone(); },
  };
  const sandbox = {
    URL, Request, Response,
    self: { registration: { scope: 'https://example.test/hub/' }, addEventListener: (name, handler) => handlers.set(name, handler), async skipWaiting() {}, clients: { async claim() { claimed = true; } } },
    caches: { async open() { return cache; }, async keys() { return ['melaz-public:/hub/:old', 'another-app-private', 'melaz-public:/other/:old']; }, async delete(key) { deleted.push(key); } },
    async fetch(request, options) { fetched.push({ request, options }); if (offline) throw new TypeError('Offline'); return new Response('PRIVATE USER CONTENT', { headers: { 'Cache-Control': 'no-store' } }); },
  };
  vm.runInNewContext(source, sandbox);
  return {
    entries, fetched, deleted,
    get precached() { return precached; }, get claimed() { return claimed; },
    async lifecycle(name) { let promise; handlers.get(name)({ waitUntil(value) { promise = value; } }); await promise; },
    async request(path, { mode = 'navigate', method = 'GET' } = {}) { let promise; handlers.get('fetch')({ request: { url: new URL(path, 'https://example.test/hub/').href, mode, method }, respondWith(value) { promise = value; } }); return promise ? await promise : null; },
  };
}
test('manifest installable et même identité sur toutes les pages', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.short_name, 'Melaz');
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.equal(manifest.id, './');
  for (const icon of manifest.icons) {
    const bytes = await fs.readFile(new URL(icon.src, root)); assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    const size = Number(icon.sizes.split('x')[0]); assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  }
  const appleIcon = await fs.readFile(new URL('assets/pwa/apple-touch-icon.png', root));
  assert.equal(appleIcon.readUInt32BE(16), 180); assert.equal(appleIcon.readUInt32BE(20), 180);
  assert.equal(appleIcon[25], 2); // PNG RGB opaque : iOS applique lui-même le masque.
  for (const file of ['index.html', 'login.php', 'projets/tempo/index.html', 'projets/en-route/index.html']) {
    const html = await fs.readFile(new URL(file, root), 'utf8');
    assert.match(html, /rel="manifest"/); assert.match(html, /apple-touch-icon/); assert.match(html, /apple-mobile-web-app-title" content="Melaz"/); assert.match(html, /assets\/pwa\.js/);
    assert.match(html, /viewport-fit=cover/);
  }
});
test('le précache ne contient que les icônes et la page hors ligne', async () => {
  const w = worker(); await w.lifecycle('install'); assert.equal(w.precached.length, 4);
  for (const request of w.precached) { assert.equal(request.credentials, 'omit'); assert(!/\.php|auth\/|index\.html/.test(request.url)); }
});
test('les pages personnelles sont toujours demandées au réseau sans mise en cache', async () => {
  const w = worker(); await w.lifecycle('install'); const before = w.entries.size;
  const response = await w.request('projets/tempo/'); assert.equal(await response.text(), 'PRIVATE USER CONTENT');
  assert.equal(w.fetched[0].options.cache, 'no-store'); assert.equal(w.entries.size, before);
});
test('aucune interception des API, des écritures ou des ressources externes', async () => {
  const w = worker();
  for (const path of ['auth/api.php?action=me', 'projets/tempo/api.php', 'projets/en-route/api.php?action=departures']) assert.equal(await w.request(path), null);
  assert.equal(await w.request('login.php', { method: 'POST' }), null);
  assert.equal(await w.request('https://external.test/'), null);
  assert.equal(await w.request('assets/auth/session.js', { mode: 'cors' }), null);
});
test('le mode hors ligne affiche seulement la page publique prévue', async () => {
  const w = worker({ offline: true }); await w.lifecycle('install'); const before = w.entries.size;
  const response = await w.request('projets/tempo/'); assert.equal(await response.text(), 'OFFLINE PUBLIC'); assert.equal(w.entries.size, before);
  assert.equal(await w.request('projets/tempo/api.php'), null);
});
test('sans cache disponible, le mode hors ligne renvoie une erreur explicite', async () => {
  const response = await worker({ offline: true }).request('login.php'); assert.equal(response.status, 503); assert.match(await response.text(), /Connexion internet/);
});
test('une mise à jour ne supprime pas le cache des autres applications', async () => {
  const w = worker(); await w.lifecycle('activate'); assert.deepEqual(w.deleted, ['melaz-public:/hub/:old']); assert.equal(w.claimed, true);
});
