// À exécuter uniquement contre le serveur de tests isolé (comptes fictifs).
// Ne jamais utiliser la base de production pour ces tests.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:8779';
const client = () => ({ cookies: new Map(), csrf: null });
async function request(browser, route, body) {
  const headers = { Accept: 'application/json', Cookie: [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ') };
  if (body) Object.assign(headers, { 'Content-Type': 'application/json', 'X-Hub-CSRF': browser.csrf });
  const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const setCookies = response.headers.getSetCookie();
  for (const cookie of setCookies) {
    const pair = cookie.split(';')[0], index = pair.indexOf('=');
    const name = pair.slice(0, index), value = pair.slice(index + 1);
    if (/max-age=0/i.test(cookie) || value === 'deleted' || value === '') browser.cookies.delete(name);
    else browser.cookies.set(name, value);
  }
  const text = await response.text(); let data = {};
  try { data = JSON.parse(text); } catch { /* Les pages protégées renvoient du HTML. */ }
  if (data.csrf) browser.csrf = data.csrf;
  return { status: response.status, data, text, setCookies };
}
async function login(name) {
  const browser = client(); await request(browser, '/auth/api.php?action=me');
  const result = await request(browser, '/auth/api.php?action=login', { username: name, password: 'Carnet-demo-2026!' });
  assert.equal(result.status, 200, result.text);
  const persistent = result.setCookies.find(cookie => cookie.startsWith('melaz_remember='));
  assert(persistent && /HttpOnly/i.test(persistent) && /SameSite=Lax/i.test(persistent));
  assert.match(persistent, /Max-Age=2592000\b/i);
  await request(browser, '/auth/api.php?action=me');
  return browser;
}
const first = await login('demo'), otherDevice = await login('demo'), second = await login('second');
console.log('PASS: cookie persistant de 30 jours émis pour chaque navigateur');
const initial = first.cookies.get('melaz_remember');
first.cookies.delete('melaz_session'); first.csrf = null;
let result = await request(first, '/projets/tempo/');
assert.equal(result.status, 200);
assert(first.cookies.has('melaz_session'));
assert.notEqual(first.cookies.get('melaz_remember'), initial);
result = await request(first, '/auth/api.php?action=me'); assert.equal(result.data.user.id, 1);
assert(!Object.hasOwn(result.data, 'remember_token'));
console.log('PASS: retour après fermeture du navigateur sans mot de passe, avec rotation du secret');
second.cookies.delete('melaz_session'); second.csrf = null;
result = await request(second, '/auth/api.php?action=me'); assert.equal(result.data.user.id, 2);
console.log('PASS: la reconnexion conserve la séparation des utilisateurs');
const copiedToken = first.cookies.get('melaz_remember');
result = await request(first, '/auth/api.php?action=logout', {}); assert.equal(result.status, 200);
assert(!first.cookies.has('melaz_remember'));
result = await request(first, '/projets/tempo/api.php'); assert.equal(result.status, 401);
const replay = client(); replay.cookies.set('melaz_remember', copiedToken);
result = await request(replay, '/auth/api.php?action=me'); assert.equal(result.data.user, null);
console.log('PASS: déconnexion supprime le cookie et révoque sa copie côté serveur');
otherDevice.cookies.delete('melaz_session');
result = await request(otherDevice, '/auth/api.php?action=me'); assert.equal(result.data.user.id, 1);
console.log('PASS: la déconnexion d’un appareil préserve les autres appareils du compte');
console.log('Tests HTTP de connexion persistante terminés.');
