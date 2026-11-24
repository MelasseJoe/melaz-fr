import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanTitle,taskFromReply,tasksFromReply,byPriority,newId,notebookFromReply,tasksInList} from '../projets/plateaux/core.mjs';
test('titres Unicode et saisies invalides',()=>{
 assert.equal(cleanTitle('  Préparer le café ☕  '),'Préparer le café ☕');
 assert.equal(cleanTitle('📚'.repeat(160)).length,320);
 for (const value of ['', ' '.repeat(10),'é'.repeat(161),'a\nb',null]) assert.throws(()=>cleanTitle(value));
});
test('les anciennes tâches et les nouvelles listes gardent leurs priorités et leur état', () => {
 const legacy = {id:'a'.repeat(32),title:'Ancienne tâche',priority:'high',done:true,revision:4,createdAt:'2026-11-17 12:00:00'};
 const list = {id:'b'.repeat(32),name:'Maison'};
 const other = {...legacy,id:'c'.repeat(32),title:'Nouvelle tâche',priority:'low',done:false,listId:list.id};
 const notebook = notebookFromReply({tasks:[legacy, other],lists:[list]});
 assert.deepEqual(notebook.lists.map(entry => entry.name), ['Rappels', 'Maison']);
 assert.deepEqual(tasksInList(notebook.tasks, 'rappels'), [{...legacy,listId:null}]);
 assert.deepEqual(tasksInList(notebook.tasks, list.id), [other]);
 assert.equal(tasksInList(notebook.tasks, 'all').length, 2);
 assert.throws(() => notebookFromReply({tasks:[other],lists:[]}));
 const renamed = notebookFromReply({tasks:[legacy, other],lists:[list],defaultListName:'À faire'});
 assert.deepEqual(renamed.lists[0], {id:'rappels',name:'À faire'});
 assert.deepEqual(tasksInList(renamed.tasks, 'rappels'), [{...legacy,listId:null}]);
});
test('une réponse incohérente ne remplace pas la liste',()=>{
 const task={id:'a'.repeat(32),title:'Test',priority:'high',done:false,revision:1,createdAt:'2026-11-17 12:00:00'};
 assert.equal(taskFromReply(task).title,'Test');
 for(const change of [{priority:'unknown'},{done:'false'},{id:'<script>'},{revision:0},{title:null}])assert.throws(()=>taskFromReply({...task,...change}));
 assert.throws(()=>tasksFromReply({tasks:[task,task]}));
 assert.throws(()=>tasksFromReply({tasks:null}));
});
test('le tri met les priorités hautes en premier et garde la chronologie à priorité égale', () => {
 const rows = [
   {id:'a', priority:'low', createdAt:'2026-11-17 09:00:00'},
   {id:'d', priority:'high', createdAt:'2026-11-17 11:00:00'},
   {id:'b', priority:'high', createdAt:'2026-11-17 10:00:00'},
   {id:'c', priority:'normal', createdAt:'2026-11-17 08:00:00'},
   {id:'e', priority:'high', createdAt:'2026-11-17 11:00:00'},
 ];
 assert.deepEqual(byPriority(rows).map(task => task.id), ['b', 'd', 'e', 'c', 'a']);
 assert.deepEqual(rows.map(task => task.id), ['a', 'd', 'b', 'c', 'e']);
});
test('identifiants d’ajout uniques et aptes aux nouvelles tentatives',()=>{
 const ids=Array.from({length:100},()=>newId());
 assert.equal(new Set(ids).size,100); ids.forEach(id=>assert.match(id,/^[a-f0-9]{32}$/));
});
