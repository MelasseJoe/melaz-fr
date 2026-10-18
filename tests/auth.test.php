<?php
declare(strict_types=1);
require __DIR__ . '/../auth/lib.php';
function check(bool $condition, string $label): void { if (!$condition) throw new RuntimeException('FAIL: ' . $label); $GLOBALS['checks'][] = $label; }
$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE hub_users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, display_name TEXT, password_hash TEXT, active INTEGER DEFAULT 1, auth_version INTEGER DEFAULT 1)');
$db->exec('CREATE TABLE hub_user_settings (user_id INTEGER, namespace TEXT, settings_json TEXT, PRIMARY KEY(user_id,namespace))');
$db->exec('CREATE TABLE hub_login_attempts (bucket_key TEXT PRIMARY KEY, attempts INTEGER, expires_at INTEGER)');
$db->exec('CREATE TABLE tempo_sport_days (user_id INTEGER, sport_date TEXT, PRIMARY KEY(user_id,sport_date))');
$password = 'Mot-de-passe-de-test-2026';
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 4]);
$q = $db->prepare('INSERT INTO hub_users (id,username,display_name,password_hash) VALUES (?,?,?,?)');
$q->execute([1, 'owner', 'Propriétaire', $hash]); $q->execute([2, 'second', 'Deuxième compte', $hash]);
$accounts = new HubAuth\Accounts($db);
$user = $accounts->authenticate('OWNER', $password, 'test-a');
check((int) $user['id'] === 1 && !isset($user['password_hash']), 'identification normalisée sans fuite de l’empreinte');
check(password_get_info($db->query('SELECT password_hash FROM hub_users WHERE id=1')->fetchColumn())['options']['cost'] === 12, 'renforcement automatique du coût bcrypt');
try { $accounts->authenticate('owner', 'incorrect', 'test-b'); check(false,'mauvais mot de passe'); } catch (HubAuth\AuthError $e) { check($e->status === 401,'mauvais mot de passe refusé'); }
$db->exec('UPDATE hub_users SET active=0 WHERE id=2');
try { $accounts->authenticate('second', $password, 'test-c'); check(false,'compte désactivé'); } catch (HubAuth\AuthError $e) { check($e->status === 401,'compte désactivé refusé'); }
$db->exec('UPDATE hub_users SET active=1 WHERE id=2');
for ($i=0;$i<8;$i++) $accounts->consumeAttempt('locked','limited-ip',time());
try { $accounts->consumeAttempt('locked','limited-ip',time()); check(false,'limitation'); } catch (HubAuth\AuthError $e) { check($e->status === 429,'tentatives répétées limitées côté serveur'); }
$accounts->saveSettings(1,'en-route',['line'=>'line:IDFM:C01384','stop'=>'stop_area:IDFM:71324']);
check($accounts->settings(2) === [], 'un autre compte ne voit pas les préférences du propriétaire');
$accounts->saveSettings(2,'en-route',['line'=>'line:IDFM:C01371','stop'=>'']);
check($accounts->settings(1)['en-route']['line'] === 'line:IDFM:C01384', 'écriture des préférences isolée par compte');
$accounts->saveSettings(1,'en-route',['line'=>'line:IDFM:C01384','stop'=>'','user_id'=>2]);
check($accounts->settings(2)['en-route']['line'] === 'line:IDFM:C01371', 'identifiant de compte envoyé dans les préférences ignoré');
try { $accounts->saveSettings(1,'en-route',['line'=>'javascript:evil','stop'=>'']); check(false,'injection'); } catch (HubAuth\AuthError $e) { check($e->status === 422,'sélection de transport invalide refusée'); }
$salt = random_bytes(16);
$pbkdf = 'pbkdf2-sha256$600000$' . base64_encode($salt) . '$' . base64_encode(hash_pbkdf2('sha256',$password,$salt,600000,32,true));
check(HubAuth\passwordMatches($password,$pbkdf) && !HubAuth\passwordMatches('incorrect',$pbkdf),'empreinte de l’outil hors ligne compatible avec PHP');
check(!HubAuth\passwordMatches(str_repeat('a',73),password_hash(str_repeat('a',72), PASSWORD_BCRYPT, ['cost'=>4])),'absence de troncature silencieuse des mots de passe bcrypt');
$_SERVER['SCRIPT_NAME']='/auth/api.php';
check(HubAuth\nextPath('https://evil.example') === '/' && HubAuth\nextPath('//evil.example') === '/', 'redirections externes refusées');
$_SERVER['SCRIPT_NAME']='/sous-dossier/auth/api.php';
check(HubAuth\basePath() === '/sous-dossier/' && HubAuth\nextPath('/sous-dossier/projets/tempo/') === '/sous-dossier/projets/tempo/', 'déploiement en sous-dossier pris en charge');
$_SERVER['SCRIPT_NAME']='/auth/api.php';
HubAuth\startSession(); $before = session_id();
HubAuth\establish($user);
check(session_id() !== $before && HubAuth\currentUser($accounts)['id'] === 1, 'session renouvelée à la connexion');
try { HubAuth\checkCsrf('incorrect'); check(false,'CSRF'); } catch (HubAuth\AuthError $e) { check($e->status === 403,'écritures sans jeton CSRF refusées'); }
HubAuth\checkCsrf(HubAuth\csrf()); check(true,'jeton valide accepté');
$db->exec('UPDATE hub_users SET auth_version=2 WHERE id=1');
check(HubAuth\currentUser($accounts) === null,'sessions révoquées après changement de version');
$user['auth_version']=2; HubAuth\establish($user); $_SESSION['hub_user']['seen']=time()-43201;
check(HubAuth\currentUser($accounts) === null,'expiration de la session côté serveur');
session_write_close();
foreach ($GLOBALS['checks'] as $label) echo 'PASS: ' . $label . "\n";
echo "Tests authentification terminés.\n";
