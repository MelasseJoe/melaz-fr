<?php
declare(strict_types=1);
require __DIR__ . '/../projets/bibliotheque/lib.php';
use Bibliotheque\LibraryError;
function check(bool $ok, string $label): void { if (!$ok) throw new RuntimeException('FAIL: ' . $label); echo 'PASS: ' . $label . "\n"; }
function rejects(callable $call, int $status, string $label): void { try { $call(); } catch (LibraryError $e) { check($e->status === $status, $label); return; } throw new RuntimeException('FAIL: ' . $label); }
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE library_books (user_id INTEGER, id TEXT, title TEXT, author TEXT, finished_on TEXT, note TEXT, work_key TEXT, edition_key TEXT, cover_id INTEGER, revision INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT DEFAULT NULL, PRIMARY KEY(user_id,id))');
$repo = new Bibliotheque\Books($db);
$input = ['id' => str_repeat('a',32), 'title' => 'L’Étranger', 'author' => 'Albert Camus', 'date' => '2025-02-28', 'note' => 'Une lecture.', 'workKey' => '/works/OL14933414W', 'editionKey' => '/books/OL12345M', 'coverId' => 12345, 'user_id' => 2];
$book = $repo->create(1,$input);
check(count($repo->all(1)) === 1 && $repo->all(2) === [], 'création isolée par utilisateur, user_id du client ignoré');
check(!isset($book['user_id']) && $book['revision'] === 1, 'réponse limitée aux métadonnées du livre et à sa version');
check($repo->create(1,$input)['id'] === $book['id'] && count($repo->all(1)) === 1, 'nouvelle tentative idempotente sans doublon');
$repo->create(2,array_merge($input,['title'=>'Livre du second compte']));
check($repo->all(2)[0]['title'] === 'Livre du second compte' && $repo->all(1)[0]['title'] === 'L’Étranger', 'même identifiant autorisé sans mélanger les comptes');
$update = ['id'=>$book['id'],'revision'=>1,'date'=>'2025-03-01','note'=>'Souvenir modifié','user_id'=>2];
$updated = $repo->update(1,$update);
check($updated['date'] === '2025-03-01' && $updated['revision'] === 2 && $repo->all(2)[0]['note'] === 'Une lecture.', 'modification isolée et version incrémentée');
check($updated['editionKey'] === $input['editionKey'] && $updated['coverId'] === $input['coverId'], 'sauvegarder une ancienne fiche conserve son édition');
rejects(fn()=>$repo->update(1,$update),409,'écriture concurrente périmée refusée');
$privateId = str_repeat('b',32); $repo->create(1,array_merge($input,['id'=>$privateId,'date'=>'2025-04-01']));
rejects(fn()=>$repo->update(2,array_merge($update,['id'=>$privateId])),404,'modification du livre d’un autre compte refusée');
rejects(fn()=>$repo->remove(2,['id'=>$privateId,'revision'=>1]),404,'retrait du livre d’un autre compte refusé');
check($repo->all(1)[0]['id'] === $privateId,'livres triés du plus récemment terminé au plus ancien');
$removed = $repo->remove(1,['id'=>$privateId,'revision'=>1]);
check(count($repo->all(1)) === 1 && (int)$db->query('SELECT COUNT(*) FROM library_books')->fetchColumn() === 3 && $removed['revision'] === 2,'retrait logique et conservation de l’enregistrement');
rejects(fn()=>$repo->restore(2,['id'=>$privateId,'revision'=>2]),404,'restauration d’un autre compte refusée');
rejects(fn()=>$repo->restore(1,['id'=>$privateId,'revision'=>1]),409,'restauration concurrente périmée refusée');
$restored = $repo->restore(1,['id'=>$privateId,'revision'=>2]);
check(count($repo->all(1)) === 2 && $restored['revision'] === 3,'annulation du retrait avec conservation des données');
rejects(fn()=>$repo->restore(1,['id'=>$privateId,'revision'=>3]),409,'double restauration signalée');
$changed = $repo->update(1,['id'=>$privateId,'revision'=>3,'date'=>'2025-04-01','note'=>'Édition choisie','editionKey'=>'/books/OL67890M','coverId'=>null,'title'=>'Nouvelle édition']);
check($changed['editionKey'] === '/books/OL67890M' && $changed['coverId'] === null && $changed['title'] === 'Nouvelle édition' && $changed['revision'] === 4, 'édition et couverture enregistrées ensemble, ancienne couverture effacée si absente');
check($repo->all(1)[0]['editionKey'] === '/books/OL67890M' && $repo->all(2)[0]['editionKey'] === $input['editionKey'], 'édition choisie persistante et isolée par compte');
rejects(fn()=>$repo->update(1,['id'=>$privateId,'revision'=>3,'date'=>'2025-04-01','note'=>'','editionKey'=>'/books/OL111M']),409,'un changement d’édition périmé ne remplace pas une version récente');
rejects(fn()=>$repo->create(1,array_merge($input,['date'=>'2999-01-01'])),422,'date future refusée');
rejects(fn()=>$repo->create(1,array_merge($input,['coverId'=>'https://evil.example/'])),422,'couverture limitée à un identifiant numérique, pas une URL');
rejects(fn()=>$repo->create(1,array_merge($input,['workKey'=>'javascript:alert(1)'])),422,'référence externe arbitraire refusée');
rejects(fn()=>$repo->create(1,array_merge($input,['note'=>str_repeat('a',2001)])),422,'souvenir trop long refusé');
rejects(fn()=>$repo->create(1,array_merge($input,['title'=>"a\x00b"])),422,'caractères de contrôle refusés');
rejects(fn()=>$repo->create(1,array_merge($input,['author'=>"\xff"])),422,'UTF-8 malformé refusé');
check(Bibliotheque\text(str_repeat('é',200),200,'Titre') === str_repeat('é',200),'limite mesurée en caractères Unicode');
check(Bibliotheque\date('2024-02-29','2026-11-04') === '2024-02-29','date bissextile valide acceptée');
foreach (['2025-02-29','2026-04-31','1899-12-31','2026-11-05','2026-1-01'] as $date) rejects(fn()=>Bibliotheque\date($date,'2026-11-04'),422,'date invalide refusée : '.$date);
$raw = ['docs'=>[['key'=>'OL1W','title'=>'Original','author_name'=>['Autrice'],'cover_i'=>22,'editions'=>['docs'=>[['key'=>'/books/OL2M','title'=>'Édition française','cover_i'=>33]]]],['key'=>'/works/OL1W','title'=>'Doublon'],['key'=>'http://evil/','title'=>'Invalide'],['key'=>'/works/OL3W','title'=>'Sans couverture','author_name'=>[],'cover_i'=>-1]]];
$found = Bibliotheque\normalizeSearch($raw);
check(count($found) === 2 && $found[0]['workKey'] === '/works/OL1W' && $found[0]['title'] === 'Édition française' && $found[0]['coverId'] === 33,'édition sélectionnée, couverture correspondante et résultats dédoublonnés');
check($found[1]['coverId'] === null && $found[1]['author'] === 'Auteur non renseigné','absence de couverture et d’auteur gérée sans image inventée');
rejects(fn()=>Bibliotheque\normalizeSearch(['error'=>'bad']),503,'réponse catalogue malformée signalée');
$withoutCover = Bibliotheque\normalizeSearch(['docs'=>[['key'=>'/works/OL1W','title'=>'Titre','cover_i'=>123,'editions'=>['docs'=>[['key'=>'/books/OL2M','title'=>'Édition sans image']]]]]]);
check($withoutCover[0]['coverId'] === null, 'une édition sans image ne récupère pas la couverture générale de l’œuvre');
$editionData = ['size'=>3,'entries'=>[
 ['key'=>'/books/OL10M','title'=>'Édition française','works'=>[['key'=>'/works/OL1W']],'covers'=>[-1,456],'publishers'=>['Picquier'],'publish_date'=>'2018','languages'=>[['key'=>'/languages/fre']],'isbn_13'=>['9782809713565'],'physical_format'=>'Poche'],
 ['key'=>'/books/OL11M','title'=>'Édition sans couverture','covers'=>[]],
 ['key'=>'/books/OL12M','title'=>'Autre œuvre','works'=>[['key'=>'/works/OL999W']],'covers'=>[999]],
]];
$editions = Bibliotheque\normalizeEditions($editionData,'/works/OL1W',0);
check(count($editions['editions']) === 2 && $editions['editions'][0]['coverId'] === 456 && $editions['editions'][1]['coverId'] === null, 'couvertures propres à chaque édition et œuvres étrangères exclues');
check($editions['editions'][0]['publisher'] === 'Picquier' && $editions['editions'][0]['languages'] === ['fre'] && $editions['editions'][0]['isbn'] === '9782809713565', 'éditeur, langue et ISBN restitués pour identifier l’édition');
$page = ['size'=>31,'entries'=>array_fill(0,30,$editionData['entries'][0])];
check(Bibliotheque\normalizeEditions($page,'/works/OL1W',0)['nextOffset'] === 30, 'pagination calculée sur les entrées brutes même après dédoublonnage');
check(Bibliotheque\normalizeEditions(['size'=>31,'entries'=>[$editionData['entries'][0]]],'/works/OL1W',30)['nextOffset'] === null, 'pagination terminée sur la dernière édition');
rejects(fn()=>Bibliotheque\normalizeEditions(['error'=>'bad'],'/works/OL1W',0),503,'liste d’éditions malformée signalée');
$directory = sys_get_temp_dir().'/library-catalog-test-'.bin2hex(random_bytes(6)); $calls = 0; $requested = '';
$catalog = new Bibliotheque\Catalog($directory,function($url) use (&$calls,&$requested,$raw) { $calls++; $requested=$url; return $raw; });
try {
    $a = $catalog->search('titre & ISBN'); $b = $catalog->search('titre & ISBN');
    check($a === $b && $calls === 1,'cache partagé évitant un second appel catalogue');
    check(str_starts_with($requested,'https://openlibrary.org/search.json?') && str_contains($requested,'q=titre%20%26%20ISBN') && str_contains($requested,'limit=12') && str_contains($requested,'lang=fr'),'URL fixe, recherche encodée, langue française et limite serveur');
    $start = microtime(true);
    $catalog->search('autre titre');
    check($calls === 2 && microtime(true) - $start >= 1.0, 'recherches successives espacées sans bloquer le choix d’édition');
    rejects(fn()=>$catalog->search('a'),422,'recherche trop courte refusée');
    rejects(fn()=>$catalog->editions('https://evil.example'),422,'URL d’édition arbitraire refusée avant tout appel réseau');
} finally { foreach(glob($directory.'/*')?:[] as $file) unlink($file); rmdir($directory); }
$directory = sys_get_temp_dir().'/library-editions-test-'.bin2hex(random_bytes(6));
$calls = 0;
$catalog = new Bibliotheque\Catalog($directory, function($url) use (&$calls, $editionData) {
    $calls++;
    check($url === 'https://openlibrary.org/works/OL1W/editions.json?limit=30&offset=0', 'point d’entrée des éditions fixe et paginé');
    return $editionData;
});
try {
    $first = $catalog->editions('/works/OL1W');
    check($catalog->editions('/works/OL1W') === $first && $calls === 1, 'pages d’éditions mises en cache entre les visiteurs');
} finally { foreach(glob($directory.'/*')?:[] as $file) unlink($file); rmdir($directory); }
$directory = sys_get_temp_dir().'/library-french-test-'.bin2hex(random_bytes(6));
$catalog = new Bibliotheque\Catalog($directory, function($url) use ($editionData) {
    $query = []; parse_str(parse_url($url, PHP_URL_QUERY), $query);
    if (str_contains($url, '/query.json?')) {
        check($query['works'] === '/works/OL1W' && $query['languages'] === '/languages/fre' && $query['type'] === '/type/edition', 'éditions filtrées en français pour l’œuvre avant les autres langues');
        check(isset($query['title'], $query['covers'], $query['isbn_13']) && $query['limit'] === '30', 'métadonnées projetées et pagination bornée pour le français');
        return $query['offset'] === '0' ? array_fill(0,30,$editionData['entries'][0]) : [];
    }
    return $editionData;
});
try {
    $first = $catalog->editions('/works/OL1W',0,'fr');
    check($first['nextGroup'] === 'fr' && $first['nextOffset'] === 30 && $first['editions'][0]['languages'] === ['fre'], 'les éditions françaises suivantes restent prioritaires');
    $last = $catalog->editions('/works/OL1W',30,'fr');
    check($last['nextGroup'] === 'other' && $last['nextOffset'] === 0, 'autres langues seulement après la dernière page française');
    check($catalog->editions('/works/OL1W',0,'other')['nextGroup'] === null, 'fin de la pagination des autres langues');
    rejects(fn()=>$catalog->editions('/works/OL1W',0,'invalid'),422,'groupe de langue invalide refusé');
} finally { foreach(glob($directory.'/*')?:[] as $file) unlink($file); rmdir($directory); }
echo "Tests bibliothèque terminés.\n";
