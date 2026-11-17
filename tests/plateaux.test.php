<?php
declare(strict_types=1);
require __DIR__ . '/../projets/plateaux/lib.php';
function check(bool $ok, string $label): void { if (!$ok) throw new RuntimeException('FAIL: ' . $label); echo 'PASS: ' . $label . "\n"; }
function rejects(callable $call, int $status, string $label): void { try { $call(); } catch (Plateaux\TaskError $error) { check($error->status === $status, $label); return; } throw new RuntimeException('FAIL: ' . $label); }
$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE todo_tasks (user_id INTEGER, id TEXT, title TEXT, priority TEXT DEFAULT "high", completed INTEGER DEFAULT 0, revision INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT DEFAULT NULL, PRIMARY KEY(user_id,id))');
$repo = new Plateaux\Tasks($db);
$input = ['id'=>str_repeat('a',32),'title'=>'  Tâche privée du premier compte  ','priority'=>'high','user_id'=>2];
$task = $repo->create(1,$input);
check($task['title'] === trim($input['title']) && $task['done'] === false && $task['revision'] === 1,'création et état initial');
check(count($repo->all(1)) === 1 && $repo->all(2) === [] && !isset($task['user_id']),'compte client ignoré, données isolées et réponse sans identifiant du compte');
check($repo->create(1,$input)['id'] === $task['id'] && count($repo->all(1)) === 1,'nouvel essai d’ajout sans doublon');
$repo->create(2,array_merge($input,['title'=>'Tâche du second compte','priority'=>'low']));
$changed = $repo->update(1,['id'=>$task['id'],'revision'=>1,'priority'=>'normal','user_id'=>2]);
check($changed['priority'] === 'normal' && $changed['revision'] === 2 && !$changed['done'] && $repo->all(2)[0]['priority'] === 'low','changement de priorité isolé et incrément de version');
rejects(fn()=>$repo->update(1,['id'=>$task['id'],'revision'=>1,'done'=>true]),409,'modification concurrente périmée refusée');
$checked = $repo->update(1,['id'=>$task['id'],'revision'=>2,'done'=>true]);
check($checked['done'] && $checked['priority'] === 'normal','cocher conserve la priorité et la tâche en base');
$again = $repo->update(1,['id'=>$task['id'],'revision'=>3,'done'=>false]);
check(!$again['done'] && $again['revision'] === 4,'décocher rétablit la tâche');
$private = $repo->create(1,array_merge($input,['id'=>str_repeat('b',32)]));
rejects(fn()=>$repo->update(2,['id'=>$private['id'],'revision'=>1,'done'=>true]),404,'modification d’une tâche étrangère refusée');
rejects(fn()=>$repo->remove(2,['id'=>$private['id'],'revision'=>1]),404,'annulation d’un ajout étranger refusée');
$removed = $repo->remove(1,['id'=>$private['id'],'revision'=>1]);
check(count($repo->all(1)) === 1 && $removed['revision'] === 2 && (int)$db->query('SELECT COUNT(*) FROM todo_tasks')->fetchColumn() === 3,'annuler un ajout le retire sans suppression physique');
rejects(fn()=>$repo->create(1,array_merge($input,['id'=>$private['id']])),409,'répéter un ajout annulé ne ressuscite pas une tâche');
foreach (['',str_repeat('é',161),"a\nligne","a\0b","\xff"] as $invalid) rejects(fn()=>$repo->create(1,array_merge($input,['title'=>$invalid])),422,'titres vides, longs, multiligne et UTF-8 malformé refusés');
check(Plateaux\title(str_repeat('é',160)) === str_repeat('é',160),'limite comptée en caractères Unicode');
foreach (['urgent',null,[],1] as $value) rejects(fn()=>$repo->update(1,['id'=>$task['id'],'revision'=>4,'priority'=>$value]),422,'priorité invalide refusée');
foreach (['false',0,1,null] as $value) rejects(fn()=>$repo->update(1,['id'=>$task['id'],'revision'=>4,'done'=>$value]),422,'état non booléen refusé');
rejects(fn()=>$repo->update(1,['id'=>$task['id'],'revision'=>'4','done'=>true]),422,'version de type incorrect refusée');
rejects(fn()=>$repo->create(1,array_merge($input,['id'=>"' OR 1=1 --"])),422,'identifiant arbitraire refusé');
$literal = '<img src=x onerror=alert(1)>';
check($repo->create(1,array_merge($input,['id'=>str_repeat('c',32),'title'=>$literal]))['title'] === $literal,'titre conservé comme texte pour le rendu échappé');
echo "Tests Plateaux terminés.\n";
