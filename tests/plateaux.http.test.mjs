// Ce test n'écrit que dans l'environnement local isolé de démonstration.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base='http://127.0.0.1:8784';
const client=()=>({cookies:new Map(),csrf:''});
async function request(c,path,body,extra={}){
 const response=await fetch(base+path,{method:body?'POST':'GET',redirect:'manual',headers:{Cookie:[...c.cookies].map(([key,value])=>`${key}=${value}`).join('; '),...(body?{'Content-Type':'application/json','X-Hub-CSRF':c.csrf}:{}),...extra},body:body?JSON.stringify(body):undefined});
 for(const cookie of response.headers.getSetCookie()){const [name,...value]=cookie.split(';')[0].split('=');c.cookies.set(name,value.join('='));}
 const data=(response.headers.get('content-type')||'').includes('application/json')?await response.json():await response.text();if(data.csrf)c.csrf=data.csrf;
 return{status:response.status,data,headers:response.headers};
}
async function login(name){const c=client();await request(c,'/auth/api.php?action=me');const result=await request(c,'/auth/api.php?action=login',{username:name,password:'Plateaux-demo-2026!',next:'/projets/plateaux/'});assert.equal(result.data.next,'/projets/plateaux/');await request(c,'/auth/api.php?action=me');return c;}
const api='/projets/plateaux/api.php';
assert.equal((await request(client(),api)).status,401);
for(const path of ['/projets/plateaux/','/projets/plateaux/index.html','/projets/plateaux/index.php']){
 const result=await request(client(),path);assert.equal(result.status,302);assert.match(result.headers.get('location'),/next=%2Fprojets%2Fplateaux%2F/);
}
const owner=await login('demo'),other=await login('second'),device=await login('demo');
assert.equal((await request(owner,'/projets/plateaux/')).status,200);
const before=await request(owner,api),count=before.data.tasks.length;assert.match(before.headers.get('cache-control'),/no-store/);
const list={id:randomBytes(16).toString('hex'),name:'Maison '+randomBytes(3).toString('hex'),user_id:2};
assert.equal((await request(owner,api+'?action=create_list',list,{'X-Hub-CSRF':'invalid'})).status,403);
assert.deepEqual((await request(owner,api+'?action=create_list',list)).data.list,{id:list.id,name:list.name});
assert.equal((await request(owner,api+'?action=create_list',list)).status,201);
assert.equal((await request(owner,api+'?action=create_list',{...list,id:randomBytes(16).toString('hex')})).status,409);
assert.equal((await request(device,api)).data.lists.filter(entry=>entry.id===list.id).length,1);
assert.deepEqual((await request(other,api)).data.lists,[]);
const input={id:randomBytes(16).toString('hex'),title:'Tâche test réseau',priority:'high',user_id:2};
assert.equal((await request(owner,api+'?action=create',input,{'X-Hub-CSRF':'invalid'})).status,403);
assert.equal((await request(owner,api+'?action=create',input,{'Sec-Fetch-Site':'cross-site'})).status,403);
assert.equal((await request(owner,api+'?action=create',input,{'Content-Type':'text/plain'})).status,415);
assert.equal((await request(owner,api+'?action=create',{...input,title:'é'.repeat(161)})).status,422);
assert.equal((await request(other,api+'?action=create',{...input,listId:list.id})).status,404);
assert.equal((await request(owner,api+'?action=create',{...input,listId:list.id})).status,201);
assert.equal((await request(owner,api+'?action=create',{...input,listId:list.id})).status,201);
assert.equal((await request(owner,api)).data.tasks.length,count+1);
assert.equal((await request(other,api)).data.tasks.length,0);
assert.equal((await request(device,api)).data.tasks.find(task=>task.id===input.id).title,input.title);
assert.equal((await request(device,api)).data.tasks.find(task=>task.id===input.id).listId,list.id);
const change={id:input.id,revision:1,priority:'low',done:true};
assert.equal((await request(other,api+'?action=update',change)).status,404);
assert.equal((await request(owner,api+'?action=update',{...change,listId:null})).status,422);
assert.equal((await request(device,api+'?action=update',change)).status,200);
assert.equal((await request(owner,api+'?action=update',change)).status,409);
const saved=(await request(owner,api)).data.tasks.find(task=>task.id===input.id);assert.equal(saved.done,true);assert.equal(saved.priority,'low');assert.equal(saved.revision,2);assert.equal(saved.listId,list.id);
const rename={id:list.id,previousName:list.name,name:'Chez moi '+randomBytes(3).toString('hex')};
assert.equal((await request(owner,api+'?action=rename_list',rename,{'X-Hub-CSRF':'invalid'})).status,403);
assert.equal((await request(other,api+'?action=rename_list',rename)).status,404);
assert.deepEqual((await request(owner,api+'?action=rename_list',rename)).data.list,{id:list.id,name:rename.name});
const renamed=(await request(device,api)).data;
assert.equal(renamed.lists.find(entry=>entry.id===list.id).name,rename.name);
assert.deepEqual(renamed.tasks.find(task=>task.id===input.id),saved);
const defaultName=before.data.defaultListName;
assert.equal((await request(owner,api+'?action=rename_list',{id:'rappels',previousName:defaultName,name:'À faire'})).status,200);
assert.equal((await request(device,api)).data.defaultListName,'À faire');
assert.equal((await request(other,api)).data.defaultListName,'Rappels');
assert.equal((await request(owner,api+'?action=rename_list',{id:'rappels',previousName:'À faire',name:defaultName})).status,200);
assert.equal((await request(owner,api+'?action=update',{id:input.id,revision:2,done:false,priority:'high'})).status,200);
assert.equal((await request(other,api+'?action=delete',{id:input.id,revision:3})).status,404);
assert.equal((await request(owner,api+'?action=delete',{id:input.id,revision:3})).status,200);
assert.equal((await request(device,api)).data.tasks.length,count);
assert.equal((await request(owner,api+'?action=unknown',{})).status,404);
assert.equal((await request(owner,api+'?action[]=list')).status,404);
console.log('PASS HTTP : routes protégées, CSRF, listes privées et persistantes, renommage, rattachement des tâches, ajouts idempotents, priorités, tâches terminées et conflits.');
