<?php
declare(strict_types=1);

namespace EnRoute;

final class ApiError extends \RuntimeException
{
    public int $status;
    public string $kind;
    public function __construct(string $message, int $status = 503, string $kind = 'unavailable')
    {
        parent::__construct($message);
        $this->status = $status;
        $this->kind = $kind;
    }
}

function items(mixed $value): array
{
    if (!is_array($value) || !$value) return [];
    return array_is_list($value) ? $value : [$value];
}

function text(mixed $value): string
{
    if (is_scalar($value)) return trim((string) $value);
    if (!is_array($value)) return '';
    if (isset($value['value'])) return text($value['value']);
    return implode(' / ', array_filter(array_map(__NAMESPACE__ . '\\text', items($value))));
}

function plain(mixed $value): string
{
    $value = preg_replace('~<(?:br\s*/?|/p|/div)>~i', "\n", text($value));
    return trim(html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

function instant(mixed $value): ?int
{
    $value = text($value);
    if ($value === '') return null;
    try {
        $zone = new \DateTimeZone('Europe/Paris');
        if (preg_match('/^\d{8}T\d{6}$/D', $value)) {
            $date = \DateTimeImmutable::createFromFormat('!Ymd\THis', $value, $zone);
            return $date === false ? null : $date->getTimestamp();
        }
        return (new \DateTimeImmutable($value, $zone))->getTimestamp();
    } catch (\Throwable $error) {
        return null;
    }
}

function iso(int $time): string
{
    return gmdate('Y-m-d\TH:i:s\Z', $time);
}

function lineRef(string $id): string
{
    if (!preg_match('/^line:IDFM:(C\d+)$/D', $id, $match)) {
        throw new ApiError('Cette ligne n’est pas reconnue.', 422, 'invalid_input');
    }
    return 'STIF:Line::' . $match[1] . ':';
}

function stopRef(array $object): ?string
{
    foreach (items($object['codes'] ?? []) as $code) {
        $value = text($code['value'] ?? '');
        if (preg_match('/^STIF:(?:StopPoint:Q|StopArea:SP):\d+:$/D', $value)) return $value;
    }
    $id = (string) ($object['id'] ?? '');
    // Conversion documentée des identifiants REFLEX ; les noms ne servent jamais d’identifiants.
    if (preg_match('/^stop_area:IDFM:(?:monomodalStopPlace:)?(\d+)$/D', $id, $m)) return 'STIF:StopArea:SP:' . $m[1] . ':';
    if (preg_match('/^stop_point:IDFM:(\d+)$/D', $id, $m)) return 'STIF:StopPoint:Q:' . $m[1] . ':';
    return null;
}

function normalizeStops(array $points): array
{
    $groups = [];
    foreach ($points as $point) {
        if (!is_array($point) || empty($point['id'])) continue;
        $area = $point['stop_area'] ?? [];
        $id = (string) ($area['id'] ?? $point['id']);
        $ref = stopRef($area);
        if (!$ref) $ref = stopRef($point);
        if (!$ref) continue;
        if (!isset($groups[$id])) {
            $groups[$id] = ['id' => $id, 'name' => plain($area['name'] ?? $point['name'] ?? ''), 'refs' => [], 'pointRefs' => []];
        }
        $groups[$id]['refs'][$ref] = $ref;
        $pointRef = stopRef($point);
        if ($pointRef) $groups[$id]['pointRefs'][$pointRef] = $pointRef;
    }
    foreach ($groups as &$group) {
        $group['refs'] = array_values($group['refs']);
        $group['pointRefs'] = array_values($group['pointRefs']);
    }
    unset($group);
    $result = array_values($groups);
    usort($result, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));
    return $result;
}

function orderStops(array $stops, array $routes): array
{
    $byId = array_column($stops, null, 'id');
    $paths = [];
    foreach ($routes as $route) {
        $path = [];
        foreach (items($route['stop_points'] ?? []) as $point) {
            $id = $point['stop_area']['id'] ?? $point['id'] ?? '';
            if (isset($byId[$id]) && !in_array($id, $path, true)) $path[] = $id;
        }
        if ($path) $paths[] = ['id' => $route['id'] ?? '', 'stops' => $path];
    }
    // Le parcours complet prime sur les services partiels et les parcours de travaux.
    usort($paths, fn($a, $b) => (count($b['stops']) <=> count($a['stops'])) ?: strcmp($a['id'], $b['id']));
    $order = [];
    foreach ($paths as $path) {
        $sequence = $path['stops'];
        $shared = array_values(array_filter($sequence, fn($id) => in_array($id, $order, true)));
        if (count($shared) > 1 && array_search($shared[0], $order, true) > array_search($shared[count($shared) - 1], $order, true)) $sequence = array_reverse($sequence);
        $previous = null;
        foreach ($sequence as $index => $id) {
            if (!in_array($id, $order, true)) {
                $position = count($order);
                if ($previous !== null) $position = array_search($previous, $order, true) + 1;
                else {
                    foreach (array_slice($sequence, $index + 1) as $next) {
                        $found = array_search($next, $order, true);
                        if ($found !== false) { $position = $found; break; }
                    }
                }
                array_splice($order, $position, 0, [$id]);
            }
            $previous = $id;
        }
    }
    foreach ($stops as $stop) if (!in_array($stop['id'], $order, true)) $order[] = $stop['id'];
    return array_map(fn($id) => $byId[$id], $order);
}

function serviceDeliveries(array $data, string $type): array
{
    $service = $data['Siri']['ServiceDelivery'] ?? $data['siri']['serviceDelivery'] ?? null;
    if (!is_array($service)) throw new ApiError('La réponse du temps réel n’est pas exploitable.');
    $lower = lcfirst($type);
    if (($service['Status'] ?? true) === false || ($service['Status'] ?? true) === 'false') throw new ApiError('Le service temps réel est momentanément indisponible.');
    if (!array_key_exists($type, $service) && !array_key_exists($lower, $service)) throw new ApiError('La réponse du temps réel est incomplète.');
    $deliveries = items($service[$type] ?? $service[$lower] ?? []);
    foreach ($deliveries as $delivery) {
        $status = $delivery['Status'] ?? $delivery['status'] ?? true;
        if ($status === false || $status === 'false') throw new ApiError('Le service ne fournit pas de données pour cet arrêt.');
    }
    return $deliveries;
}

function normalizeDepartures(array $data, string $line, int $now): array
{
    $directions = [];
    $seen = [];
    $cancelled = 0;
    $recorded = [];
    foreach (serviceDeliveries($data, 'StopMonitoringDelivery') as $delivery) {
        $stamp = instant($delivery['ResponseTimestamp'] ?? null);
        if ($stamp) $recorded[] = $stamp;
        foreach (items($delivery['MonitoredStopVisit'] ?? []) as $visit) {
            $trip = $visit['MonitoredVehicleJourney'] ?? [];
            if (text($trip['LineRef'] ?? '') !== lineRef($line)) continue;
            $call = $trip['MonitoredCall'] ?? [];
            $statuses = [strtolower(text($call['DepartureStatus'] ?? '')), strtolower(text($call['ArrivalStatus'] ?? ''))];
            if (array_intersect($statuses, ['cancelled', 'canceled'])) { $cancelled++; continue; }
            $expected = instant($call['ExpectedArrivalTime'] ?? $call['ExpectedDepartureTime'] ?? null);
            $aimed = instant($call['AimedArrivalTime'] ?? $call['AimedDepartureTime'] ?? null);
            $time = $expected ?? $aimed;
            if (($call['VehicleAtStop'] ?? false) === true && $time !== null && $time < $now - 45) {
                $departure = instant($call['ExpectedDepartureTime'] ?? $call['AimedDepartureTime'] ?? null);
                if ($departure !== null && $departure >= $now) $time = $departure;
            }
            if (!$time || $time < $now - 45) continue;
            $directionRef = text($trip['DirectionRef'] ?? '');
            $name = plain($trip['DirectionName'] ?? $trip['DestinationName'] ?? $call['DestinationDisplay'] ?? '');
            $destination = plain($call['DestinationDisplay'] ?? $trip['DestinationName'] ?? $name);
            $direction = $directionRef !== '' ? 'ref:' . $directionRef : 'name:' . ($name ?: $destination);
            if ($direction === 'name:') $direction = 'unknown';
            if (!isset($directions[$direction])) $directions[$direction] = ['id' => $direction, 'name' => $name ?: ($destination ?: 'Direction non précisée'), 'departures' => []];
            $visitId = text($visit['ItemIdentifier'] ?? '') ?: hash('sha256', $direction . '|' . $destination . '|' . $time);
            if (isset($seen[$visitId])) continue;
            $seen[$visitId] = true;
            $directions[$direction]['departures'][] = ['id' => $visitId, 'time' => iso($time), 'destination' => $destination, 'realtime' => $expected !== null, 'atStop' => ($call['VehicleAtStop'] ?? false) === true, 'platform' => plain($call['DeparturePlatformName'] ?? $call['ArrivalPlatformName'] ?? '')];
        }
    }
    foreach ($directions as &$direction) {
        usort($direction['departures'], fn($a, $b) => strcmp($a['time'], $b['time']));
        $direction['departures'] = array_slice($direction['departures'], 0, 10);
    }
    unset($direction);
    return ['directions' => array_values($directions), 'cancelled' => $cancelled, 'recordedAt' => $recorded ? iso(min($recorded)) : null];
}

function activePeriod(array $periods, int $now): bool
{
    foreach ($periods as $period) {
        $begin = instant($period['begin'] ?? null);
        $end = instant($period['end'] ?? null);
        if ($begin !== null && $begin <= $now && ($end === null || $now < $end)) return true;
    }
    return false;
}

function normalizeTraffic(array $disruptions, array $reports, int $now): array
{
    $lineMap = [];
    foreach ($reports as $report) {
        $line = $report['line'] ?? [];
        $collectLinks = function (array $object) use (&$collectLinks, &$lineMap, $line): void {
            foreach ($object as $key => $value) {
                if ($key === 'links') {
                    foreach (items($value) as $link) {
                        if (($link['type'] ?? '') === 'disruption') $lineMap[$link['id'] ?? ''][] = $line;
                    }
                } elseif (is_array($value)) {
                    $collectLinks($value);
                }
            }
        };
        $collectLinks($report);
    }
    $result = [];
    foreach ($disruptions as $disruption) {
        if (!activePeriod(items($disruption['application_periods'] ?? []), $now)) continue;
        $id = (string) ($disruption['id'] ?? hash('sha256', json_encode($disruption)));
        $lines = $lineMap[$id] ?? [];
        $scopes = [];
        foreach (items($disruption['impacted_objects'] ?? []) as $impacted) {
            $object = $impacted['pt_object'] ?? [];
            if (isset($object['line'])) $lines[] = $object['line'];
            if (isset($object['line_section']['line'])) $lines[] = $object['line_section']['line'];
            if (isset($impacted['impacted_section']['line'])) $lines[] = $impacted['impacted_section']['line'];
            if (!empty($object['name'])) $scopes[] = plain($object['name']);
        }
        $displayLines = [];
        foreach ($lines as $line) {
            $mode = plain($line['commercial_mode']['name'] ?? '');
            if (!preg_match('/^(?:métro|metro|rer)$/iu', trim($mode))) continue;
            $key = (string) ($line['id'] ?? $line['code'] ?? $line['name'] ?? '');
            if ($key !== '') $displayLines[$key] = ['id' => $key, 'code' => plain($line['code'] ?? $line['name'] ?? ''), 'mode' => plain($line['commercial_mode']['name'] ?? ''), 'color' => preg_match('/^[0-9a-f]{6}$/iD', $line['color'] ?? '') ? '#' . $line['color'] : null, 'textColor' => preg_match('/^[0-9a-f]{6}$/iD', $line['text_color'] ?? '') ? '#' . $line['text_color'] : null];
        }
        $messages = [];
        $title = '';
        foreach (items($disruption['messages'] ?? []) as $message) {
            $copy = plain($message['text'] ?? '');
            if ($copy !== '') $messages[$copy] = $copy;
            $channel = $message['channel'] ?? [];
            if ($title === '' && (in_array('title', $channel['types'] ?? [], true) || ($channel['name'] ?? '') === 'titre')) $title = $copy;
        }
        $severity = $disruption['severity'] ?? [];
        if (!$displayLines) continue;
        $equipment = '/ascenseur|escalier[s]?\s+m[ée]canique|escalator|[ée]l[ée]vateur|moving\s+walkway|tapis\s+roulant/iu';
        $headline = $title ?: plain($disruption['cause'] ?? '');
        // Un message de circulation peut mentionner un équipement sans porter sur sa panne.
        if (preg_match($equipment, $headline)) continue;
        if ($title === '' && preg_match($equipment, implode(' ', $messages))) continue;
        $result[$id] = ['id' => $id, 'title' => $title ?: plain($severity['name'] ?? $disruption['cause'] ?? 'Perturbation'), 'effect' => text($severity['effect'] ?? ''), 'priority' => (int) ($severity['priority'] ?? 100), 'lines' => array_values($displayLines), 'scope' => implode(' · ', array_unique($scopes)), 'messages' => array_values($messages), 'updatedAt' => $disruption['updated_at'] ?? null];
    }
    $result = array_values($result);
    usort($result, fn($a, $b) => $a['priority'] <=> $b['priority']);
    return $result;
}

function normalizeMessages(array $data, string $line, array $stop, string $scope, int $now): array
{
    $result = [];
    $allowedRefs = array_merge($stop['refs'], $stop['pointRefs']);
    foreach (serviceDeliveries($data, 'GeneralMessageDelivery') as $delivery) {
        foreach (items($delivery['InfoMessage'] ?? []) as $message) {
            $until = instant($message['ValidUntilTime'] ?? null);
            if ($until !== null && $until <= $now) continue;
            $content = $message['Content'] ?? [];
            $lineRefs = array_map(__NAMESPACE__ . '\\text', items($content['LineRef'] ?? []));
            if ($lineRefs && !in_array(lineRef($line), $lineRefs, true)) continue;
            $stopRefs = array_map(__NAMESPACE__ . '\\text', items($content['StopPointRef'] ?? []));
            if ($stopRefs && !array_intersect($allowedRefs, $stopRefs)) continue;
            $copies = [];
            foreach (items($content['Message'] ?? []) as $copy) {
                $copy = $copy['MessageText'] ?? $copy['messageText'] ?? '';
                foreach (items($copy) as $languageText) {
                    $lang = is_array($languageText) ? ($languageText['lang'] ?? 'fr') : 'fr';
                    if ($lang !== 'fr') continue;
                    $value = plain($languageText);
                    if ($value !== '') $copies[$value] = $value;
                }
                if (is_string($copy) && $copy !== '') $copies[$copy] = plain($copy);
            }
            if (!$copies) continue;
            // Un même message peut contenir une version courte et une version intégrale.
            usort($copies, fn($a, $b) => strlen($b) <=> strlen($a));
            $body = $copies[0];
            $id = text($message['InfoMessageIdentifier'] ?? $message['ItemIdentifier'] ?? '') ?: hash('sha256', $body);
            $result[$id] = ['id' => $id, 'text' => $body, 'channel' => plain($message['InfoChannelRef'] ?? 'Information'), 'scope' => $scope, 'validUntil' => $until ? iso($until) : null];
        }
    }
    return array_values($result);
}

function normalizeJourneys(array $data): array
{
    $result = [];
    foreach (array_slice(items($data['journeys'] ?? []), 0, 3) as $journey) {
        $sections = [];
        foreach (items($journey['sections'] ?? []) as $section) {
            $info = $section['display_informations'] ?? [];
            $sections[] = ['type' => $section['type'] ?? '', 'mode' => plain($info['commercial_mode'] ?? $section['mode'] ?? ''), 'line' => plain($info['code'] ?? ''), 'direction' => plain($info['direction'] ?? ''), 'from' => plain($section['from']['name'] ?? ''), 'to' => plain($section['to']['name'] ?? ''), 'departure' => ($time = instant($section['departure_date_time'] ?? null)) ? iso($time) : null, 'arrival' => ($time = instant($section['arrival_date_time'] ?? null)) ? iso($time) : null, 'duration' => (int) ($section['duration'] ?? 0), 'realtime' => ($section['data_freshness'] ?? '') === 'realtime', 'stops' => max(0, count($section['stop_date_times'] ?? []) - 1)];
        }
        $result[] = ['departure' => ($time = instant($journey['departure_date_time'] ?? null)) ? iso($time) : null, 'arrival' => ($time = instant($journey['arrival_date_time'] ?? null)) ? iso($time) : null, 'duration' => (int) ($journey['duration'] ?? 0), 'transfers' => (int) ($journey['nb_transfers'] ?? 0), 'walking' => (int) ($journey['durations']['walking'] ?? 0), 'sections' => $sections, 'status' => plain($journey['status'] ?? '')];
    }
    return $result;
}

final class PrimClient
{
    private array $config;
    private string $directory;
    private string $keyHash;
    public function __construct(array $config)
    {
        $this->config = $config;
        $this->keyHash = substr(hash('sha256', $config['api_key']), 0, 20);
        $this->directory = rtrim($config['cache_dir'], '/');
        if (!is_dir($this->directory) && !@mkdir($this->directory, 0700, true) && !is_dir($this->directory)) throw new ApiError('Le cache du serveur doit être accessible en écriture.', 503, 'cache_unavailable');
        if (!is_writable($this->directory)) throw new ApiError('Le cache du serveur doit être accessible en écriture.', 503, 'cache_unavailable');
    }

    public function cached(string $name, int $ttl, callable $load): array
    {
        $path = $this->directory . '/' . hash('sha256', $this->keyHash . $name) . '.json';
        $lock = fopen($path . '.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX)) throw new ApiError('Le cache est temporairement indisponible.');
        try {
            $entry = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
            if (is_array($entry) && ($entry['expires'] ?? 0) > time()) {
                if (isset($entry['error'])) throw new ApiError($entry['error'], $entry['status'], $entry['kind']);
                return $entry['value'];
            }
            try {
                $value = $load();
                file_put_contents($path, json_encode(['expires' => time() + $ttl, 'value' => $value], JSON_THROW_ON_ERROR), LOCK_EX);
                @chmod($path, 0600);
                return $value;
            } catch (ApiError $error) {
                // Ne pas servir de vieux horaires comme s’ils étaient encore à jour.
                file_put_contents($path, json_encode(['expires' => time() + ($error->status === 429 ? 120 : 20), 'error' => $error->getMessage(), 'status' => $error->status, 'kind' => $error->kind]), LOCK_EX);
                throw $error;
            }
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public function request(string $service, string $path, array $params = []): array
    {
        if (!function_exists('curl_init')) throw new ApiError('L’extension PHP cURL est nécessaire sur le serveur.', 503, 'curl_missing');
        $guard = fopen($this->directory . '/upstream-' . $this->keyHash . '.json', 'c+');
        if (!$guard || !flock($guard, LOCK_EX)) throw new ApiError('Le service est temporairement occupé.');
        try {
            $state = json_decode(stream_get_contents($guard), true) ?: [];
            $today = (new \DateTimeImmutable('now', new \DateTimeZone('Europe/Paris')))->format('Y-m-d');
            if (($state['day'] ?? '') !== $today) $state = ['day' => $today, 'counts' => [], 'last' => 0];
            $bucket = $service === 'journeys' ? 'generic' : $service;
            $limit = max(1, (int) ($this->config['daily_limits'][$bucket] ?? 900));
            if (($state['counts'][$bucket] ?? 0) >= $limit) throw new ApiError('La limite quotidienne prévue pour ce service est atteinte. Réessaie demain.', 429, 'quota');
            if (($state['blockedUntil'] ?? 0) > time()) throw new ApiError('PRIM demande de patienter avant une nouvelle requête.', 429, 'quota');
            $delay = 0.26 - (microtime(true) - ($state['last'] ?? 0));
            if ($delay > 0) usleep((int) ($delay * 1000000));
            $state['counts'][$bucket] = ($state['counts'][$bucket] ?? 0) + 1;
            $state['last'] = microtime(true);
            $writeState = function () use ($guard, &$state): void { rewind($guard); ftruncate($guard, 0); fwrite($guard, json_encode($state)); fflush($guard); };
            $writeState();
            $url = 'https://prim.iledefrance-mobilites.fr/marketplace/' . $path;
            if ($params) $url .= '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
            $curl = curl_init($url);
            curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 18, CURLOPT_HTTPHEADER => ['apikey: ' . $this->config['api_key'], 'Accept: application/json'], CURLOPT_USERAGENT => 'EnRoute-Hub/1.0', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_ENCODING => '']);
            $body = curl_exec($curl);
            $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            curl_close($curl);
            if ($status === 429) { $state['blockedUntil'] = time() + 120; $writeState(); throw new ApiError('Le quota PRIM est momentanément atteint. Réessaie dans quelques minutes.', 429, 'quota'); }
            if ($status === 401 || $status === 403) throw new ApiError('La clé PRIM est refusée ou ne donne pas accès à ce service.', 503, 'unauthorized');
            if ($body === false || $status >= 500 || $status === 0) throw new ApiError('PRIM ne répond pas pour le moment. Réessaie un peu plus tard.');
            if ($status < 200 || $status >= 300) throw new ApiError($service === 'journeys' ? 'Aucun itinéraire disponible pour cette recherche.' : 'PRIM n’a pas pu traiter cette recherche.', $service === 'journeys' ? 422 : 503, $service === 'journeys' ? 'no_journey' : 'upstream_error');
            try { $data = json_decode($body, true, 256, JSON_THROW_ON_ERROR); } catch (\Throwable $error) { throw new ApiError('La réponse de PRIM n’est pas exploitable.'); }
            if (!is_array($data) || isset($data['error'])) throw new ApiError('Les données demandées sont momentanément indisponibles.');
            return $data;
        } finally {
            flock($guard, LOCK_UN);
            fclose($guard);
        }
    }

    public function collection(string $path, string $field, array $params = [], int $maxPages = 30, string $service = 'generic'): array
    {
        $values = [];
        for ($page = 0; $page < $maxPages; $page++) {
            $data = $this->request($service, $path, array_merge($params, ['count' => 100, 'start_page' => $page]));
            if (!array_key_exists($field, $data)) throw new ApiError('Le référentiel demandé n’est pas disponible.');
            $batch = items($data[$field]);
            $values = array_merge($values, $batch);
            $pagination = $data['pagination'] ?? [];
            $total = (int) ($pagination['total_result'] ?? count($values));
            if (count($values) >= $total || !$batch) return $values;
        }
        throw new ApiError('Le référentiel est trop volumineux pour être chargé entièrement. Réessaie plus tard.');
    }

    public function lines(): array
    {
        return $this->cached('lines:colors:v2', 86400, function () {
            $raw = $this->collection('v2/navitia/physical_modes/physical_mode%3AMetro/lines', 'lines', ['depth' => 1]);
            $result = [];
            foreach ($raw as $line) {
                if (!preg_match('/^line:IDFM:C\d+$/D', $line['id'] ?? '')) continue;
                $color = preg_match('/^[0-9a-f]{6}$/iD', $line['color'] ?? '') ? '#' . $line['color'] : null;
                $textColor = preg_match('/^[0-9a-f]{6}$/iD', $line['text_color'] ?? '') ? '#' . $line['text_color'] : null;
                $result[] = ['id' => $line['id'], 'code' => plain($line['code'] ?? $line['name'] ?? ''), 'name' => plain($line['name'] ?? ''), 'color' => $color, 'textColor' => $textColor];
            }
            usort($result, fn($a, $b) => strnatcasecmp($a['code'], $b['code']));
            return $result;
        });
    }

    public function requireLine(string $id): array
    {
        lineRef($id);
        foreach ($this->lines() as $line) if ($line['id'] === $id) return $line;
        throw new ApiError('Choisis une ligne de métro disponible.', 422, 'invalid_input');
    }

    public function stops(string $line): array
    {
        $this->requireLine($line);
        return $this->cached('stops:route-order:v2:' . $line, 86400, function () use ($line) {
            $base = 'v2/navitia/lines/' . rawurlencode($line);
            $stops = normalizeStops($this->collection($base . '/stop_points', 'stop_points', ['depth' => 2]));
            $routes = $this->collection($base . '/routes', 'routes', ['depth' => 3]);
            return orderStops($stops, $routes);
        });
    }

    public function requireStop(string $line, string $id): array
    {
        foreach ($this->stops($line) as $stop) if ($stop['id'] === $id) return $stop;
        throw new ApiError('Choisis un arrêt desservi par cette ligne.', 422, 'invalid_input');
    }
}
