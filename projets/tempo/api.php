<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function currentUserId(): int
{
    // Le futur login du hub fournira ici l'identifiant de sa session.
    // Aucune valeur user_id transmise par le navigateur n'est utilisée.
    return 1;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    respond(405, ['error' => 'Méthode non autorisée.']);
}

// La session protège les écritures contre les requêtes intersites ; ce n'est pas un login.
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_name('tempo_session');
session_set_cookie_params([
    'lifetime' => 0, 'path' => '/', 'secure' => $secure,
    'httponly' => true, 'samesite' => 'Strict',
]);
if (!session_start()) {
    respond(503, ['error' => 'La session du serveur est indisponible.']);
}
if (!isset($_SESSION['tempo_csrf'])) {
    $_SESSION['tempo_csrf'] = bin2hex(random_bytes(32));
}
$csrf = $_SESSION['tempo_csrf'];
session_write_close();

if ($method === 'POST') {
    if (!hash_equals($csrf, (string) ($_SERVER['HTTP_X_TEMPO_CSRF'] ?? ''))) {
        respond(403, ['error' => 'La session a expiré. Recharge la page avant de réessayer.']);
    }
    if (strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        respond(403, ['error' => 'Requête intersite refusée.']);
    }
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
        respond(415, ['error' => 'Le contenu doit être du JSON.']);
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 1024) {
        respond(413, ['error' => 'Requête trop volumineuse.']);
    }
}

$configPath = getenv('TEMPO_CONFIG') ?: dirname(__DIR__, 3) . '/tempo-config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/config.php';
}
if (!is_file($configPath)) {
    respond(503, ['error' => 'La base de données doit être configurée sur le serveur. Consulte le fichier LISEZ-MOI.md fourni avec Tempo.']);
}

try {
    $config = require $configPath;
    if (!is_array($config)) {
        throw new RuntimeException('Invalid database configuration');
    }
    foreach (['host', 'database', 'username', 'password'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key])) {
            throw new RuntimeException('Missing database setting');
        }
    }
    if (preg_match('/[;\x00-\x1f]/', $config['host'] . $config['database'])) {
        throw new RuntimeException('Invalid database setting');
    }
    date_default_timezone_set($config['timezone'] ?? 'Europe/Paris');
    $today = date('Y-m-d');
    $port = (int) ($config['port'] ?? 3306);
    if ($port < 1 || $port > 65535) {
        throw new RuntimeException('Invalid database port');
    }
    $db = new PDO(
        'mysql:host=' . $config['host'] . ';port=' . $port . ';dbname=' . $config['database'] . ';charset=utf8mb4',
        $config['username'], $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_TIMEOUT => 10]
    );
    $userId = currentUserId();

    if ($method === 'GET') {
        // Toutes les dates restent disponibles pour le record, même hors des 13 mois affichés.
        $query = $db->prepare('SELECT sport_date FROM tempo_sport_days WHERE user_id = ? AND sport_date <= ? ORDER BY sport_date');
        $query->execute([$userId, $today]);
        respond(200, ['days' => $query->fetchAll(PDO::FETCH_COLUMN), 'today' => $today, 'csrf' => $csrf]);
    }

    $raw = file_get_contents('php://input', false, null, 0, 1025);
    if ($raw === false || strlen($raw) > 1024) {
        respond(413, ['error' => 'Requête trop volumineuse.']);
    }
    try {
        $input = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        respond(400, ['error' => 'Le JSON est invalide.']);
    }
    $date = is_array($input) ? ($input['date'] ?? null) : null;
    $active = is_array($input) ? ($input['active'] ?? null) : null;
    if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) || !is_bool($active)) {
        respond(422, ['error' => 'Une date valide et un état sport sont requis.']);
    }
    [$year, $month, $day] = array_map('intval', explode('-', $date));
    if (!checkdate($month, $day, $year) || $date < '2000-01-01' || $date > $today) {
        respond(422, ['error' => 'Choisis une date existante, entre le 1er janvier 2000 et aujourd’hui.']);
    }
    if ($active) {
        // Idempotent : deux clics ou deux appareils ne créent pas de doublon.
        $query = $db->prepare('INSERT INTO tempo_sport_days (user_id, sport_date) VALUES (?, ?) ON DUPLICATE KEY UPDATE sport_date = VALUES(sport_date)');
    } else {
        $query = $db->prepare('DELETE FROM tempo_sport_days WHERE user_id = ? AND sport_date = ?');
    }
    $query->execute([$userId, $date]);
    respond(200, ['date' => $date, 'active' => $active]);
} catch (Throwable $exception) {
    // Le détail technique reste dans les journaux du serveur, jamais dans la réponse HTTP.
    error_log('Tempo database error: ' . $exception->getMessage());
    respond(503, ['error' => 'La base de données est indisponible. Vérifie sa configuration et l’import du fichier schema.sql.']);
}
