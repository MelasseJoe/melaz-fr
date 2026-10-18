// Tests réservés à l’aperçu local isolé : comptes demo/second et données synthétiques.
// Ne jamais diriger ce script vers la base ou le site de production.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8776';
const make=()=>({cookie:'',csrf:null});
async function req(client,path,{method='GET',body,token=client.csrf}={}){
 const headers={Accept:'application/json'};if(client.cookie)headers.Cookie=client.cookie;
 if(body!==undefined){headers['Content-Type']='application/json';if(token)headers['X-Hub-CSRF']=token;}
 const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 for(const cookie of response.headers.getSetCookie()){if(cookie.startsWith('melaz_session='))client.cookie=cookie.split(';')[0];}
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={};}return {status:response.status,data,text,headers:response.headers};
}
const pass='Carnet-demo-2026!';
async function login(name){const c=make();let r=await req(c,'/auth/api.php?action=me');c.csrf=r.data.csrf;const old=c.cookie;r=await req(c,'/auth/api.php?action=login',{method:'POST',body:{username:name,password:pass,next:'//evil.test'}});assert.equal(r.status,200,r.text);assert.equal(r.data.next,'/');assert.notEqual(c.cookie,old);r=await req(c,'/auth/api.php?action=me');c.csrf=r.data.csrf;return c;}
const guest=make();for(const p of ['/','/index.html','/projets/tempo/','/projets/tempo/index.html','/projets/en-route/','/projets/en-route/index.html']){const r=await req(guest,p);assert.equal(r.status,302,p);assert.match(r.headers.get('location'),/^\/login.php\?next=/);}
for(const p of ['/projets/tempo/api.php','/projets/en-route/api.php?action=lines'])assert.equal((await req(guest,p)).status,401);
console.log('PASS: pages et API protégées sans session');
let r=await req(guest,'/auth/api.php?action=login',{method:'POST',body:{username:'demo',password:pass}});assert.equal(r.status,403);
console.log('PASS: connexion sans jeton CSRF refusée');
const first=await login('demo'),second=await login('second');console.log('PASS: deux connexions réelles, cookies distincts et identifiant renouvelé');
r=await req(first,'/projets/tempo/api.php');assert.deepEqual(r.data.days,['2026-10-12','2026-10-14']);const tempoCsrf=r.data.csrf;
r=await req(second,'/projets/tempo/api.php');assert.deepEqual(r.data.days,['2026-10-13']);
r=await req(first,'/projets/tempo/api.php',{method:'POST',token:undefined,body:{date:'2026-10-16',active:true,user_id:2}});assert.equal(r.status,403);
// Tempo possède un nom d’en-tête CSRF historique, conservé par le client.
const sport=await fetch(base+'/projets/tempo/api.php',{method:'POST',headers:{Cookie:first.cookie,'Content-Type':'application/json','X-Tempo-CSRF':tempoCsrf},body:JSON.stringify({date:'2026-10-16',active:true,user_id:2})});assert.equal(sport.status,200,await sport.text());
r=await req(first,'/projets/tempo/api.php');assert(r.data.days.includes('2026-10-16'));r=await req(second,'/projets/tempo/api.php');assert(!r.data.days.includes('2026-10-16'));
console.log('PASS: séances distinctes et user_id fourni par le navigateur ignoré');
r=await req(first,'/auth/api.php?action=settings',{method:'POST',body:{namespace:'en-route',settings:{line:'line:IDFM:C99914',stop:'stop_area:IDFM:91001',user_id:2}}});assert.equal(r.status,200,r.text);
r=await req(second,'/auth/api.php?action=me');assert(!r.data.settings['en-route']);
const otherDevice=await login('demo');r=await req(otherDevice,'/auth/api.php?action=me');assert.equal(r.data.settings['en-route'].stop,'stop_area:IDFM:91001');
console.log('PASS: préférences partagées entre appareils du même compte, isolées entre comptes');
r=await req(first,'/projets/en-route/api.php?action=lines');assert.equal(r.status,200);assert.equal(r.data.lines.length,2);
r=await req(first,'/auth/api.php?action=logout',{method:'POST',body:{}});assert.equal(r.status,200);assert.equal((await req(first,'/projets/tempo/api.php')).status,401);assert.equal((await req(first,'/projets/en-route/api.php?action=lines')).status,401);
console.log('PASS: déconnexion invalide les deux projets');
console.log('Tests HTTP authentification terminés.');
