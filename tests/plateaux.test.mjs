import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanTitle,taskFromReply,tasksFromReply,groups,newId} from '../projets/plateaux/core.mjs';
test('titres Unicode et saisies invalides',()=>{
 assert.equal(cleanTitle('  Préparer le café ☕  '),'Préparer le café ☕');
 assert.equal(cleanTitle('📚'.repeat(160)).length,320);
 for (const value of ['', ' '.repeat(10),'é'.repeat(161),'a\nb',null]) assert.throws(()=>cleanTitle(value));
});
test('une réponse incohérente ne remplace pas la liste',()=>{
 const task={id:'a'.repeat(32),title:'Test',priority:'high',done:false,revision:1,createdAt:'2026-11-17 12:00:00'};
 assert.equal(taskFromReply(task).title,'Test');
 for(const change of [{priority:'unknown'},{done:'false'},{id:'<script>'},{revision:0},{title:null}])assert.throws(()=>taskFromReply({...task,...change}));
 assert.throws(()=>tasksFromReply({tasks:[task,task]}));
 assert.throws(()=>tasksFromReply({tasks:null}));
 assert.equal(groups([task,{...task,id:'b'.repeat(32),done:true}]).high.length,1);
});
test('identifiants d’ajout uniques et aptes aux nouvelles tentatives',()=>{
 const ids=Array.from({length:100},()=>newId());
 assert.equal(new Set(ids).size,100); ids.forEach(id=>assert.match(id,/^[a-f0-9]{32}$/));
});
