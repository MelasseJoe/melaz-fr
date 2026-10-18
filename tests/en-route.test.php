<?php
declare(strict_types=1);

require __DIR__ . '/en-route-fixtures.php';
require __DIR__ . '/../projets/en-route/lib.php';

function check(bool $condition, string $label): void
{
    if (!$condition) throw new RuntimeException('FAIL: ' . $label);
    echo 'PASS: ' . $label . "\n";
}

$now = time();
$stamp = fn(int $seconds) => EnRoute\iso($now + $seconds);
check(EnRoute\stopRef(['id' => 'stop_point:IDFM:22092']) === 'STIF:StopPoint:Q:22092:', 'identifiant quai REFLEX');
check(EnRoute\stopRef(['id' => 'stop_area:IDFM:monomodalStopPlace:42587']) === 'STIF:StopArea:SP:42587:', 'identifiant de station monomodale');
check(EnRoute\stopRef(['id' => 'stop_point:unknown:123']) === null, 'refus des conversions non documentées');

$stops = EnRoute\normalizeStops([
    ['id' => 'stop_point:IDFM:22092', 'name' => 'Châtelet', 'stop_area' => ['id' => 'stop_area:IDFM:42587', 'name' => 'Châtelet']],
    ['id' => 'stop_point:IDFM:463158', 'name' => 'Châtelet', 'stop_area' => ['id' => 'stop_area:IDFM:42587', 'name' => 'Châtelet']],
]);
check(count($stops) === 1 && count($stops[0]['pointRefs']) === 2 && count($stops[0]['refs']) === 1, 'regroupement des quais sans doublon de station');
$orderedStops = [['id' => 'a', 'name' => 'Zulu'], ['id' => 'b', 'name' => 'Alpha'], ['id' => 'c', 'name' => 'Bravo'], ['id' => 'd', 'name' => 'Delta']];
$routePoints = fn($ids) => array_map(fn($id) => ['id' => 'quai:' . $id, 'stop_area' => ['id' => $id]], $ids);
$ordered = EnRoute\orderStops($orderedStops, [['id' => 'main', 'stop_points' => $routePoints(['a', 'b', 'c'])], ['id' => 'reverse', 'stop_points' => $routePoints(['c', 'b', 'a'])], ['id' => 'branch', 'stop_points' => $routePoints(['b', 'd'])]]);
check(array_column($ordered, 'id') === ['a', 'b', 'd', 'c'], 'ordre du parcours, sens inverse dédoublonné et branche au point de jonction');

$raw = EnRoute\fixtureData('/marketplace/stop-monitoring', ['LineRef' => 'STIF:Line::C99914:']);
$visits = &$raw['Siri']['ServiceDelivery']['StopMonitoringDelivery'][0]['MonitoredStopVisit'];
$visits[] = $visits[0];
$cancelled = $visits[0];
$cancelled['ItemIdentifier'] = 'cancelled';
$cancelled['MonitoredVehicleJourney']['MonitoredCall']['DepartureStatus'] = 'onTime';
$cancelled['MonitoredVehicleJourney']['MonitoredCall']['ArrivalStatus'] = 'cancelled';
$visits[] = $cancelled;
$expired = $visits[0];
$expired['ItemIdentifier'] = 'expired';
$expired['MonitoredVehicleJourney']['MonitoredCall']['ExpectedArrivalTime'] = $stamp(-120);
$visits[] = $expired;
$other = $visits[0];
$other['ItemIdentifier'] = 'other-line';
$other['MonitoredVehicleJourney']['LineRef']['value'] = 'STIF:Line::C99904:';
$visits[] = $other;
$departures = EnRoute\normalizeDepartures($raw, 'line:IDFM:C99914', $now);
check(count($departures['directions']) === 2, 'séparation des directions communiquées par SIRI');
check(count($departures['directions'][0]['departures']) === 3, 'exclusion des doublons, passages passés et autres lignes');
check($departures['cancelled'] === 1, 'exclusion d’un passage annulé même si le départ est onTime');
check($departures['directions'][0]['departures'][0]['realtime'], 'distinction prévision temps réel');

$theoretical = $raw;
$call = &$theoretical['Siri']['ServiceDelivery']['StopMonitoringDelivery'][0]['MonitoredStopVisit'][0]['MonitoredVehicleJourney']['MonitoredCall'];
unset($call['ExpectedArrivalTime']);
$call['AimedArrivalTime'] = $stamp(60);
$parsed = EnRoute\normalizeDepartures($theoretical, 'line:IDFM:C99914', $now);
check(!$parsed['directions'][0]['departures'][0]['realtime'], 'horaire théorique identifié sans fausse promesse de temps réel');

$atPlatform = EnRoute\fixtureData('/marketplace/stop-monitoring', ['LineRef' => 'STIF:Line::C99914:']);
$firstCall = &$atPlatform['Siri']['ServiceDelivery']['StopMonitoringDelivery'][0]['MonitoredStopVisit'][0]['MonitoredVehicleJourney']['MonitoredCall'];
$firstCall['ExpectedArrivalTime'] = $stamp(60);
$firstCall['ExpectedDepartureTime'] = $stamp(120);
$parsed = EnRoute\normalizeDepartures($atPlatform, 'line:IDFM:C99914', $now);
check($parsed['directions'][0]['departures'][0]['time'] === $stamp(60), 'attente calculée à partir de l’arrivée, pas du départ');
$firstCall['VehicleAtStop'] = true;
$firstCall['ExpectedArrivalTime'] = $stamp(-120);
$parsed = EnRoute\normalizeDepartures($atPlatform, 'line:IDFM:C99914', $now);
check($parsed['directions'][0]['departures'][0]['atStop'] && $parsed['directions'][0]['departures'][0]['time'] === $stamp(120), 'un métro déjà à quai reste visible jusqu’à son départ annoncé');

$traffic1 = EnRoute\fixtureData('/marketplace/line_reports', ['start_page' => 0]);
$traffic2 = EnRoute\fixtureData('/marketplace/line_reports', ['start_page' => 1]);
$future = $traffic1['disruptions'][0];
$future['id'] = 'future';
$future['application_periods'] = [['begin' => $stamp(3600), 'end' => $stamp(7200)]];
$ended = $future;
$ended['id'] = 'ended';
$ended['application_periods'] = [['begin' => $stamp(-3600), 'end' => $stamp(0)]];
$traffic = EnRoute\normalizeTraffic(array_merge($traffic1['disruptions'], $traffic2['disruptions'], [$future, $ended], $traffic1['disruptions']), array_merge($traffic1['line_reports'], $traffic2['line_reports']), $now);
check(count($traffic) === 2, 'perturbations en cours uniquement, dédoublonnées sur toutes les pages');
check($traffic[1]['lines'][0]['code'] === '4', 'rattachement des lignes aux perturbations');
$nested = $traffic1['disruptions'][0];
$nested['id'] = 'nested-stop';
$nested['impacted_objects'] = [];
$nested['messages'] = [['text' => 'Trafic interrompu', 'channel' => ['types' => ['title']]]];
$nestedReports = [['line' => ['id' => 'line:IDFM:C01384', 'code' => '14', 'commercial_mode' => ['name' => 'Métro']], 'pt_objects' => [['stop_area' => ['links' => [['type' => 'disruption', 'id' => 'nested-stop']]]]]]];
$nestedTraffic = EnRoute\normalizeTraffic([$nested], $nestedReports, $now);
check($nestedTraffic[0]['lines'][0]['code'] === '14' && $nestedTraffic[0]['title'] === 'Trafic interrompu', 'format réel PRIM : liens imbriqués des stations et titre du message');
$equipment = $nested;
$equipment['messages'][0]['text'] = 'Panne d’un ascenseur';
check(EnRoute\normalizeTraffic([$equipment], $nestedReports, $now) === [], 'alertes ascenseurs exclues');
$busReports = $nestedReports;
$busReports[0]['line']['commercial_mode']['name'] = 'Bus';
check(EnRoute\normalizeTraffic([$nested], $busReports, $now) === [], 'perturbations bus exclues');
$rerReports = $nestedReports;
$rerReports[0]['line']['commercial_mode']['name'] = 'RER';
check(count(EnRoute\normalizeTraffic([$nested], $rerReports, $now)) === 1, 'perturbations RER conservées');
check(EnRoute\instant('20261016T120000') === strtotime('2026-10-16T10:00:00Z'), 'horaires Navitia convertis avec le fuseau de Paris');
check(EnRoute\instant('20260116T120000') === strtotime('2026-01-16T11:00:00Z'), 'heure de Paris en hiver sans décalage fixe');

$stop = ['refs' => ['STIF:StopArea:SP:91001:'], 'pointRefs' => ['STIF:StopPoint:Q:91001:']];
$messages = EnRoute\fixtureData('/marketplace/general-message', []);
$base = $messages['Siri']['ServiceDelivery']['GeneralMessageDelivery'][0]['InfoMessage'][0];
$old = $base;
$old['ValidUntilTime'] = $stamp(-1);
$old['InfoMessageIdentifier']['value'] = 'old-message';
$wrong = $base;
$wrong['Content']['LineRef'] = [['value' => 'STIF:Line::C99904:']];
$wrong['InfoMessageIdentifier']['value'] = 'wrong-line';
$wrongStop = $base;
$wrongStop['Content']['StopPointRef'] = [['value' => 'STIF:StopPoint:Q:999999:']];
$wrongStop['InfoMessageIdentifier']['value'] = 'other-stop';
$messages['Siri']['ServiceDelivery']['GeneralMessageDelivery'][0]['InfoMessage'] = [$base, $old, $wrong, $wrongStop];
$parsedMessages = EnRoute\normalizeMessages($messages, 'line:IDFM:C99914', $stop, 'line', $now);
check(count($parsedMessages) === 1 && $parsedMessages[0]['scope'] === 'line', 'messages expirés et autres lignes/stations exclus, portée conservée');
check(EnRoute\plain('<b>Texte</b><br>suite<script>alert(1)</script>') === "Texte\nsuitealert(1)", 'HTML amont réduit à du texte');

$journeys = EnRoute\normalizeJourneys(EnRoute\fixtureData('/marketplace/journeys', []));
check($journeys[0]['duration'] === 780 && $journeys[0]['walking'] === 240 && count($journeys[0]['sections']) === 3, 'durée, marche et étapes des itinéraires');
check($journeys[0]['sections'][2]['stops'] === 3, 'nombre d’arrêts issu des étapes Navitia');

$client = new EnRoute\PrimClient(['api_key' => 'synthetic-test-key', 'cache_dir' => '/tmp/en-route-test-cache-' . bin2hex(random_bytes(5)), 'daily_limits' => ['generic' => 900]]);
$GLOBALS['fixture_calls'] = [];
check(count($client->lines()) === 2, 'chargement du référentiel métro');
$client->lines();
check(count($GLOBALS['fixture_calls']) === 1, 'cache partagé : pas de deuxième appel pour les lignes');
check(count($client->stops('line:IDFM:C99914')) === 3, 'stations validées par rapport à la ligne');
try { $client->requireStop('line:IDFM:C99914', 'stop_area:IDFM:92001'); check(false, 'arrêt non desservi'); }
catch (EnRoute\ApiError $error) { check($error->status === 422, 'refus d’un arrêt qui ne dessert pas cette ligne'); }
$limited = new EnRoute\PrimClient(['api_key' => 'synthetic-limit-key', 'cache_dir' => '/tmp/en-route-test-limit-' . bin2hex(random_bytes(5)), 'daily_limits' => ['generic' => 1]]);
$limited->request('generic', 'v2/navitia/places', ['q' => 'Madeleine']);
try { $limited->request('journeys', 'v2/navitia/journeys'); check(false, 'budget partagé'); }
catch (EnRoute\ApiError $error) { check($error->status === 429, 'itinéraires et référentiel partagent le budget générique'); }

echo "Tests En route terminés.\n";
