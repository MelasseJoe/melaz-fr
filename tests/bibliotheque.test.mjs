import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHTML,coverURL,bookRows,validDate,dateLabel,editionLanguageGroup} from '../projets/bibliotheque/core.mjs';
test('le français précède les autres langues sans deviner les langues absentes',()=>{
 for(const code of ['fre','fra','fr']) assert.equal(editionLanguageGroup({languages:['eng',code]}),'fr');
 assert.equal(editionLanguageGroup({languages:['eng']}),'other');
 assert.equal(editionLanguageGroup({languages:[]}), 'unknown');
 assert.equal(editionLanguageGroup({title:'Un titre français'}), 'unknown');
});
test('les livres restent associés à leurs dates quand les rangées changent',()=>{
 const books=[{id:'a',date:'2025-01-01'},{id:'b',date:'2026-10-29'},{id:'c',date:'2026-10-29'},{id:'d',date:'2026-01-01'},{id:'e',date:'2024-12-31'}];
 assert.deepEqual(bookRows(books,4).map(row=>row.map(b=>b.id)),[['b','c','d','a'],['e']]);
 assert.deepEqual(bookRows(books,2).map(row=>row.map(b=>b.id)),[['b','c'],['d','a'],['e']]);
 assert.equal(books[0].id,'a');
});
test('les couvertures ne peuvent pointer que vers le service CoverID autorisé',()=>{
 assert.equal(coverURL({coverId:10940008},'L'),'https://covers.openlibrary.org/b/id/10940008-L.jpg?default=false');
 for(const value of [null,0,-1,2147483648,'https://evil.example',{}])assert.equal(coverURL({coverId:value}),null);
 assert.equal(coverURL({coverId:1},'../bad'),null);
});
test('dates existantes seulement, sans décalage UTC sur les libellés',()=>{
 assert.ok(validDate('2024-02-29','2026-11-04'));
 for(const d of ['2025-02-29','2026-11-05','1900-02-29','2026-04-31'])assert.equal(validDate(d,'2026-11-04'),false);
 assert.match(dateLabel('2026-10-24'),/^24 octobre 2026$/);
});
test('une édition conserve sa propre couverture face à un ancien CoverID différent', () => {
 assert.equal(coverURL({editionKey:'/books/OL33305374M',coverId:10940008},'L'), 'https://covers.openlibrary.org/b/olid/OL33305374M-L.jpg?default=false');
 assert.equal(coverURL({editionKey:'/books/OL33305374M',coverId:null}), 'https://covers.openlibrary.org/b/olid/OL33305374M-M.jpg?default=false');
 assert.equal(coverURL({editionKey:'https://evil.example/',coverId:null}), null);
});
test('les titres et souvenirs sont rendus comme du texte, pas comme du HTML',()=>{
 assert.equal(escapeHTML('<img src=x onerror="alert(1)"> & \'x\''),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;x&#39;');
});
