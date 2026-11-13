<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
require dirname(__DIR__, 2) . '/auth/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
function respond(int $status, array $body): never { http_response_code($status); echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit; }
$user = HubAuth\requireUser();
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'POST'], true)) { header('Allow: GET, POST'); throw new Bibliotheque\LibraryError('Méthode non autorisée.', 405, 'invalid_method'); }
    if (strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new Bibliotheque\LibraryError('Requête intersite refusée.', 403, 'forbidden');
    if ($method === 'POST') HubAuth\checkCsrf($_SERVER['HTTP_X_HUB_CSRF'] ?? null);
    session_write_close();
    $action = $_GET['action'] ?? ($method === 'GET' ? 'list' : '');
    if (!is_string($action)) throw new Bibliotheque\LibraryError('Action inconnue.', 404, 'not_found');
    if ($method === 'GET') {
        if ($action === 'list') respond(200, ['books' => (new Bibliotheque\Books(HubAuth\database()))->all($user['id']), 'today' => Bibliotheque\today()]);
        if ($action === 'search') {
            $query = Bibliotheque\text($_GET['q'] ?? '', 160, 'La recherche');
            $directory = getenv('LIBRARY_CACHE_DIR') ?: dirname(__DIR__, 3) . '/.open-library-cache';
            respond(200, ['books' => (new Bibliotheque\Catalog($directory))->search($query)]);
        }
        if ($action === 'editions') {
            $work = Bibliotheque\key($_GET['work'] ?? null, 'work');
            $offset = $_GET['offset'] ?? '0';
            $group = $_GET['group'] ?? 'all';
            if ($work === null || !is_string($group) || !in_array($group, ['all', 'fr', 'other'], true) || !is_string($offset) || !preg_match('/^(?:0|[1-9][0-9]{0,6})$/D', $offset)) throw new Bibliotheque\LibraryError('La liste d’éditions est invalide.', 422, 'invalid_input');
            $directory = getenv('LIBRARY_CACHE_DIR') ?: dirname(__DIR__, 3) . '/.open-library-cache';
            respond(200, (new Bibliotheque\Catalog($directory))->editions($work, (int) $offset, $group));
        }
    } else {
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) throw new Bibliotheque\LibraryError('Le contenu doit être du JSON.', 415, 'invalid_input');
        $raw = file_get_contents('php://input', false, null, 0, 20001);
        if ($raw === false || strlen($raw) > 20000) throw new Bibliotheque\LibraryError('La requête est trop volumineuse.', 413, 'invalid_input');
        try { $input = json_decode($raw, true, 12, JSON_THROW_ON_ERROR); } catch (JsonException) { throw new Bibliotheque\LibraryError('Le JSON est invalide.', 400, 'invalid_input'); }
        if (!is_array($input) || array_is_list($input)) throw new Bibliotheque\LibraryError('Le livre est invalide.', 422, 'invalid_input');
        $books = new Bibliotheque\Books(HubAuth\database());
        $book = match ($action) { 'create' => $books->create($user['id'], $input), 'update' => $books->update($user['id'], $input), 'delete' => $books->remove($user['id'], $input), 'restore' => $books->restore($user['id'], $input), default => throw new Bibliotheque\LibraryError('Action inconnue.', 404, 'not_found') };
        respond($action === 'create' ? 201 : 200, ['book' => $book]);
    }
    throw new Bibliotheque\LibraryError('Action inconnue.', 404, 'not_found');
} catch (Bibliotheque\LibraryError | HubAuth\AuthError $error) {
    if ($error->status === 429) header('Retry-After: 2');
    respond($error->status, ['error' => $error->getMessage(), 'code' => $error instanceof Bibliotheque\LibraryError ? $error->kind : 'forbidden']);
} catch (Throwable $error) {
    error_log('Bibliotheque: ' . get_class($error));
    $missing = $error instanceof PDOException && in_array((string) $error->getCode(), ['42S02', 'HY000'], true) && (str_contains($error->getMessage(), 'library_books') || str_contains($error->getMessage(), 'no such table'));
    respond(503, ['error' => $missing ? 'La bibliothèque n’est pas encore initialisée. Importe le fichier projets/bibliotheque/schema.sql dans la base du hub.' : 'La bibliothèque est momentanément indisponible. Réessaie dans un instant.', 'code' => $missing ? 'setup_required' : 'unavailable']);
}
