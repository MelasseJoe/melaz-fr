<?php
// Données synthétiques réservées aux tests, hors du dossier déployable.
declare(strict_types=1);

namespace EnRoute;

function fixtureData(string $path, array $query): array
{
    $now = time();
    $stamp = fn(int $seconds) => gmdate('Y-m-d\TH:i:s\Z', $now + $seconds);
    $compact = fn(int $seconds) => (new \DateTimeImmutable('@' . ($now + $seconds)))->setTimezone(new \DateTimeZone('Europe/Paris'))->format('Ymd\THis');
    if (str_ends_with($path, '/lines')) return ['lines' => [
        ['id' => 'line:IDFM:C99914', 'code' => '14', 'name' => 'Métro de test 14'],
        ['id' => 'line:IDFM:C99904', 'code' => '4', 'name' => 'Métro de test 4'],
    ], 'pagination' => ['total_result' => 2]];
    if (str_ends_with($path, '/stop_points')) {
        $stops = str_contains($path, 'C99904') ? [['92001', 'Châtelet'], ['92002', 'Odéon']] : [['91001', 'Madeleine'], ['91002', 'Gare de Lyon'], ['91003', 'Châtelet']];
        return ['stop_points' => array_map(fn($stop) => ['id' => 'stop_point:IDFM:' . $stop[0], 'name' => $stop[1], 'stop_area' => ['id' => 'stop_area:IDFM:' . $stop[0], 'name' => $stop[1]]], $stops), 'pagination' => ['total_result' => count($stops)]];
    }
    if (str_ends_with($path, '/routes')) {
        $points = fixtureData(str_replace('/routes', '/stop_points', $path), [])['stop_points'];
        return ['routes' => [['id' => 'route:fixture', 'stop_points' => $points]], 'pagination' => ['total_result' => 1]];
    }
    if (str_ends_with($path, 'stop-monitoring')) {
        $visits = [];
        $line = $query['LineRef'] ?? 'STIF:Line::C99914:';
        $destinations = str_contains($line, 'C99904') ? ['Bagneux–Lucie Aubrac', 'Porte de Clignancourt'] : ['Aéroport d’Orly', 'Saint-Denis–Pleyel'];
        foreach ($destinations as $direction => $name) foreach ([180, 420, 660] as $wait) {
            $visits[] = ['ItemIdentifier' => 'fixture:' . $direction . ':' . $wait, 'MonitoredVehicleJourney' => ['LineRef' => ['value' => $line], 'DirectionRef' => ['value' => (string) $direction], 'DirectionName' => [['value' => $name]], 'DestinationName' => [['value' => $name]], 'MonitoredCall' => ['ExpectedArrivalTime' => $stamp($wait + $direction * 60), 'DestinationDisplay' => [['value' => $name]], 'ArrivalStatus' => 'onTime']]];
        }
        return ['Siri' => ['ServiceDelivery' => ['StopMonitoringDelivery' => [['ResponseTimestamp' => $stamp(0), 'Status' => true, 'MonitoredStopVisit' => $visits]]]]];
    }
    if (str_ends_with($path, 'general-message')) return ['Siri' => ['ServiceDelivery' => ['GeneralMessageDelivery' => [['Status' => true, 'InfoMessage' => [[
        'InfoMessageIdentifier' => ['value' => 'fixture:screen-message'], 'InfoChannelRef' => ['value' => 'Information'], 'ValidUntilTime' => $stamp(3600),
        'Content' => ['Message' => [['MessageText' => ['value' => 'Exemple de test : veuillez laisser descendre les voyageurs avant de monter.', 'lang' => 'fr']]]],
    ]]]]]]];
    if (str_ends_with($path, 'line_reports')) {
        $page = (int) ($query['start_page'] ?? 0);
        $line = ['id' => $page ? 'line:IDFM:C99904' : 'line:IDFM:C99914', 'code' => $page ? '4' : '14', 'commercial_mode' => ['name' => 'Métro']];
        $id = $page ? 'fixture:traffic4' : 'fixture:traffic14';
        return ['line_reports' => [['line' => $line, 'pt_objects' => [['links' => [['type' => 'disruption', 'id' => $id]]]]]], 'pagination' => ['total_result' => 2], 'disruptions' => [[
            'id' => $id, 'application_periods' => [['begin' => $compact(-3600), 'end' => $compact(3600)]], 'severity' => ['name' => $page ? 'Ralentissements' : 'Circulation ralentie', 'priority' => $page + 1],
            'impacted_objects' => [['pt_object' => ['name' => $page ? 'Châtelet ↔ Odéon' : 'Madeleine ↔ Châtelet', 'line' => $line]]], 'messages' => [['text' => 'Données fictives de test : circulation ralentie en raison d’un incident technique.']],
        ]]];
    }
    if (str_ends_with($path, '/places')) {
        $queryText = strtolower($query['q'] ?? '');
        $lyon = str_contains($queryText, 'lyon');
        return ['places' => [['id' => $lyon ? 'stop_area:IDFM:91002' : 'stop_area:IDFM:91001', 'name' => $lyon ? 'Gare de Lyon (Paris)' : 'Madeleine (Paris)', 'embedded_type' => 'stop_area']]];
    }
    if (str_ends_with($path, '/journeys')) return ['journeys' => [[
        'departure_date_time' => $compact(0), 'arrival_date_time' => $compact(780), 'duration' => 780, 'nb_transfers' => 0, 'durations' => ['walking' => 240],
        'sections' => [
            ['type' => 'street_network', 'mode' => 'walking', 'duration' => 240, 'departure_date_time' => $compact(0), 'arrival_date_time' => $compact(240), 'from' => ['name' => 'Madeleine'], 'to' => ['name' => 'Quai du métro 14']],
            ['type' => 'waiting', 'duration' => 180, 'departure_date_time' => $compact(240), 'arrival_date_time' => $compact(420)],
            ['type' => 'public_transport', 'duration' => 360, 'departure_date_time' => $compact(420), 'arrival_date_time' => $compact(780), 'display_informations' => ['code' => '14', 'commercial_mode' => 'Métro', 'direction' => 'Aéroport d’Orly'], 'from' => ['name' => 'Madeleine'], 'to' => ['name' => 'Gare de Lyon'], 'stop_date_times' => [[], [], [], []]],
        ],
    ]]];
    return ['error' => ['id' => 'unknown_fixture']];
}

// Ces fonctions remplacent uniquement le transport HTTP dans le processus de test.
// Le code déployable ne charge jamais ce fichier.
function curl_init(string $url): object { return (object) ['url' => $url]; }
function curl_setopt_array(object $handle, array $options): bool { $handle->options = $options; return true; }
function curl_exec(object $handle): string
{
    $url = parse_url($handle->url);
    parse_str($url['query'] ?? '', $query);
    $GLOBALS['fixture_calls'][] = [$url['path'], $query];
    return json_encode(fixtureData($url['path'], $query));
}
function curl_getinfo(object $handle, int $key): int { return $GLOBALS['fixture_status'] ?? 200; }
function curl_close(object $handle): void {}
