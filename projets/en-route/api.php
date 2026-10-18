<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

use EnRoute\ApiError;
use EnRoute\PrimClient;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

function respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
    exit;
}

function parameter(array $input, string $name, int $max = 180): string
{
    $value = $input[$name] ?? '';
    if (!is_string($value) || strlen($value) > $max || preg_match('/[\x00-\x1f]/', $value)) throw new ApiError('La recherche contient une valeur invalide.', 422, 'invalid_input');
    return trim($value);
}

function validPlace(string $id): bool
{
    // Identifiants de lieux renvoyés par Navitia ou coordonnées d’une adresse.
    if (preg_match('/^(?:stop_area|stop_point|poi|address):[a-zA-Z0-9_:.;,\-]{1,160}$/D', $id)) return true;
    if (preg_match('/^(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?)$/D', $id, $m)) return (float) $m[1] >= -180 && (float) $m[1] <= 180 && (float) $m[2] >= -90 && (float) $m[2] <= 90;
    return false;
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'POST'], true)) { header('Allow: GET, POST'); respond(405, ['error' => 'Méthode non autorisée.']); }
    if (strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new ApiError('Requête intersite refusée.', 403, 'forbidden');
    $action = parameter($_GET, 'action', 20) ?: 'status';
    if (!in_array($action, ['status', 'lines', 'stops', 'departures', 'messages', 'traffic', 'places', 'journeys'], true)) throw new ApiError('Cette recherche n’existe pas.', 404, 'not_found');
    if (($action === 'journeys') !== ($method === 'POST')) throw new ApiError('Méthode non autorisée pour cette recherche.', 405, 'invalid_method');

    $configPath = getenv('EN_ROUTE_CONFIG') ?: dirname(__DIR__, 3) . '/en-route-config.php';
    if (!is_file($configPath)) $configPath = __DIR__ . '/config.php';
    $config = is_file($configPath) ? require $configPath : [];
    if (!is_array($config)) throw new ApiError('La configuration de PRIM doit être corrigée.', 503, 'not_configured');
    $environmentKey = getenv('PRIM_API_KEY');
    if ($environmentKey) $config['api_key'] = $environmentKey;
    $key = $config['api_key'] ?? '';
    $configured = is_string($key) && trim($key) !== '' && !str_contains($key, 'COLLER_') && !preg_match('/[\x00-\x20\x7f]/', $key);
    if ($action === 'status') respond(200, ['configured' => (bool) $configured, 'serverTime' => EnRoute\iso(time())]);
    if (!$configured) throw new ApiError('La connexion aux données PRIM n’est pas encore configurée.', 503, 'not_configured');

    $config['cache_dir'] = $config['cache_dir'] ?? dirname(__DIR__, 3) . '/.en-route-cache';
    if (!is_string($config['cache_dir']) || $config['cache_dir'] === '') throw new ApiError('Le dossier de cache doit être renseigné.', 503, 'cache_unavailable');
    @set_time_limit(90);
    $client = new PrimClient($config);
    $line = parameter($_GET, 'line');
    $stopId = parameter($_GET, 'stop');
    if ($action === 'lines') respond(200, ['lines' => $client->lines()]);
    if ($action === 'stops') {
        $stops = array_map(fn($stop) => ['id' => $stop['id'], 'name' => $stop['name']], $client->stops($line));
        respond(200, ['stops' => $stops]);
    }
    if ($action === 'departures') {
        $stop = $client->requireStop($line, $stopId);
        $result = $client->cached('departures:' . $line . ':' . $stopId, 60, function () use ($client, $stop, $line) {
            if (count($stop['refs']) > 8) throw new ApiError('Cet arrêt comporte trop de quais pour cette recherche.');
            $combined = ['Siri' => ['ServiceDelivery' => ['StopMonitoringDelivery' => []]]];
            foreach ($stop['refs'] as $ref) {
                $data = $client->request('departures', 'stop-monitoring', ['MonitoringRef' => $ref, 'LineRef' => EnRoute\lineRef($line)]);
                $combined['Siri']['ServiceDelivery']['StopMonitoringDelivery'] = array_merge($combined['Siri']['ServiceDelivery']['StopMonitoringDelivery'], EnRoute\serviceDeliveries($data, 'StopMonitoringDelivery'));
            }
            return array_merge(EnRoute\normalizeDepartures($combined, $line, time()), ['updatedAt' => EnRoute\iso(time())]);
        });
        respond(200, $result);
    }
    if ($action === 'messages') {
        $stop = $client->requireStop($line, $stopId);
        $all = [];
        $warnings = [];
        $updated = [];
        $scopes = [['StopPointRef' => $stop['refs'][0]], ['LineRef' => EnRoute\lineRef($line)]];
        foreach ($scopes as $index => $query) {
            try {
                $reply = $client->cached('messages:' . json_encode($query), 180, fn() => ['raw' => $client->request('messages', 'general-message', $query), 'updatedAt' => EnRoute\iso(time())]);
                $updated[] = $reply['updatedAt'];
                foreach (EnRoute\normalizeMessages($reply['raw'], $line, $stop, $index === 0 ? 'stop' : 'line', time()) as $message) {
                    $unique = hash('sha256', $message['text']);
                    if (!isset($all[$unique])) $all[$unique] = $message;
                }
            } catch (ApiError $error) { $warnings[] = $error->getMessage(); }
        }
        if (count($warnings) === 2) throw new ApiError($warnings[0]);
        respond(200, ['messages' => array_values($all), 'warnings' => array_values(array_unique($warnings)), 'updatedAt' => $updated ? min($updated) : EnRoute\iso(time())]);
    }
    if ($action === 'traffic') {
        $result = $client->cached('traffic:metro-rer:v4', 300, function () use ($client) {
            $disruptions = [];
            $reports = [];
            $now = new DateTimeImmutable('now', new DateTimeZone('Europe/Paris'));
            $stamp = $now->format('Ymd\THis');
            $complete = false;
            for ($page = 0; $page < 40; $page++) {
                $data = $client->request('traffic', 'v2/navitia/line_reports/line_reports', ['count' => 100, 'start_page' => $page, 'since' => $stamp, 'until' => $stamp, 'depth' => 2]);
                if (!array_key_exists('line_reports', $data)) throw new ApiError('Les perturbations ne peuvent pas être chargées pour le moment.');
                $batch = EnRoute\items($data['line_reports']);
                $reports = array_merge($reports, $batch);
                $disruptions = array_merge($disruptions, EnRoute\items($data['disruptions'] ?? []));
                if (!$batch || count($reports) >= (int) ($data['pagination']['total_result'] ?? count($reports))) { $complete = true; break; }
            }
            if (!$complete) throw new ApiError('La liste complète des perturbations est momentanément indisponible.');
            return ['disruptions' => EnRoute\normalizeTraffic($disruptions, $reports, $now->getTimestamp()), 'updatedAt' => EnRoute\iso(time())];
        });
        respond(200, $result);
    }
    if ($action === 'places') {
        $query = parameter($_GET, 'q', 120);
        if (strlen($query) < 3) respond(200, ['places' => []]);
        $result = $client->cached('places:' . $query, 3600, function () use ($client, $query) {
            $data = $client->request('generic', 'v2/navitia/places', ['q' => $query, 'count' => 8, 'depth' => 1]);
            $places = [];
            foreach (array_slice(EnRoute\items($data['places'] ?? []), 0, 8) as $place) {
                $id = (string) ($place['id'] ?? '');
                if (!validPlace($id)) continue;
                $places[] = ['id' => $id, 'name' => EnRoute\plain($place['name'] ?? ''), 'type' => $place['embedded_type'] ?? 'stop_area'];
            }
            return ['places' => $places];
        });
        respond(200, $result);
    }
    if ($action === 'journeys') {
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) throw new ApiError('Le contenu doit être du JSON.', 415, 'invalid_input');
        $raw = file_get_contents('php://input', false, null, 0, 2049);
        if ($raw === false || strlen($raw) > 2048) throw new ApiError('La recherche est trop volumineuse.', 413, 'invalid_input');
        try { $input = json_decode($raw, true, 8, JSON_THROW_ON_ERROR); } catch (JsonException $error) { throw new ApiError('La recherche est invalide.', 422, 'invalid_input'); }
        if (!is_array($input)) throw new ApiError('La recherche est invalide.', 422, 'invalid_input');
        $from = parameter($input, 'from');
        $to = parameter($input, 'to');
        if (!validPlace($from) || !validPlace($to) || $from === $to) throw new ApiError('Choisis deux lieux différents dans les suggestions.', 422, 'invalid_input');
        $slot = (int) floor(time() / 60);
        $result = $client->cached('journeys:' . $from . ':' . $to . ':' . $slot, 60, function () use ($client, $from, $to) {
            $datetime = (new DateTimeImmutable('now', new DateTimeZone('Europe/Paris')))->format('Ymd\THis');
            $data = $client->request('journeys', 'v2/navitia/journeys', ['from' => $from, 'to' => $to, 'datetime' => $datetime, 'datetime_represents' => 'departure', 'data_freshness' => 'realtime', 'max_nb_journeys' => 3, 'disable_geojson' => 'true']);
            return ['journeys' => EnRoute\normalizeJourneys($data), 'updatedAt' => EnRoute\iso(time())];
        });
        respond(200, $result);
    }
} catch (ApiError $error) {
    if ($error->status === 429) header('Retry-After: 120');
    respond($error->status, ['error' => $error->getMessage(), 'code' => $error->kind]);
} catch (Throwable $error) {
    // Ne jamais journaliser la clé, la réponse de l’API ou le contenu d’une adresse recherchée.
    error_log('Entre deux rames: ' . get_class($error));
    respond(503, ['error' => 'Le service est momentanément indisponible. Réessaie plus tard.', 'code' => 'unavailable']);
}
