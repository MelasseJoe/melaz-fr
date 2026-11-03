// Exclusivement pour le serveur local isolé et ses deux comptes fictifs.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:8779';
function client() { return { cookies: new Map(), csrf: '' }; }
async function request(c, action, body) {
  const response = await fetch(`${base}/auth/api.php?action=${action}`, {
    method: body ? 'POST' : 'GET', headers: { Cookie: [...c.cookies].map(([k,v]) => `${k}=${v}`).join('; '), ...(body ? { 'Content-Type': 'application/json', 'X-Hub-CSRF': c.csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const cookie of response.headers.getSetCookie()) { const [name, ...value] = cookie.split(';')[0].split('='); c.cookies.set(name, value.join('=')); }
  const data = await response.json();
  if (data.csrf) c.csrf = data.csrf;
  return { status: response.status, data };
}
async function login(name) {
  const c = client(); await request(c,'me');
  assert.equal((await request(c,'login',{ username: name, password: 'Carnet-demo-2026!' })).status, 200);
  await request(c,'me'); return c;
}
const first = await login('demo'), second = await login('second');
const favorites = [{line:'line:IDFM:C99904',stop:'stop_area:IDFM:92002'},{line:'line:IDFM:C99914',stop:'stop_area:IDFM:91003'}];
const save = (c,settings) => request(c,'settings',{namespace:'en-route',settings});
assert.equal((await save(first,{favorites})).status,200);
const anotherDevice = await login('demo');
assert.deepEqual((await request(anotherDevice,'me')).data.settings['en-route'].favorites,favorites);
assert.deepEqual((await request(second,'me')).data.settings['en-route']?.favorites || [], []);
assert.equal((await save(first,{line:'line:IDFM:C99914',stop:'stop_area:IDFM:91001'})).status,200);
assert.deepEqual((await request(anotherDevice,'me')).data.settings['en-route'].favorites,favorites);
assert.equal((await save(first,{favorites:[...favorites,...favorites]})).status,422);
assert.equal((await save(first,{favorites:[favorites[0],favorites[0]]})).status,422);
assert.deepEqual((await request(anotherDevice,'me')).data.settings['en-route'].favorites,favorites);
console.log('PASS HTTP : favoris sauvegardés entre sessions, isolation des comptes, recherche indépendante, limites et doublons refusés.');
