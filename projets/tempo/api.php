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

require dirname(__DIR__, 2) . '/auth/lib.php';
$user = HubAuth\requireUser();
$userId = $user['id'];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    respond(405, ['error' => 'Méthode non autorisée.']);
}

$csrf = HubAuth\csrf();
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

try {
    $db = HubAuth\database();
    $today = (new DateTimeImmutable('now', new DateTimeZone('Europe/Paris')))->format('Y-m-d');

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
        $sql = 'INSERT INTO tempo_sport_days (user_id, sport_date) VALUES (?, ?) ';
        $sql .= $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite' ? 'ON CONFLICT(user_id, sport_date) DO NOTHING' : 'ON DUPLICATE KEY UPDATE sport_date = VALUES(sport_date)';
        $query = $db->prepare($sql);
    } else {
        $query = $db->prepare('DELETE FROM tempo_sport_days WHERE user_id = ? AND sport_date = ?');
    }
    $query->execute([$userId, $date]);
    respond(200, ['date' => $date, 'active' => $active]);
} catch (Throwable $exception) {
    // Le détail technique reste dans les journaux du serveur, jamais dans la réponse HTTP.
    error_log('Tempo database error: ' . get_class($exception));
    respond(503, ['error' => 'La base de données est indisponible. Vérifie sa configuration et l’import du fichier schema.sql.']);
}
