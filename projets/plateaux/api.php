<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
require dirname(__DIR__, 2) . '/auth/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
function respond(int $status, array $data): never { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit; }
$user = HubAuth\requireUser();
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'POST'], true)) { header('Allow: GET, POST'); throw new Plateaux\TaskError('Méthode non autorisée.', 405, 'invalid_method'); }
    if (strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new Plateaux\TaskError('Requête intersite refusée.', 403, 'forbidden');
    if ($method === 'POST') HubAuth\checkCsrf($_SERVER['HTTP_X_HUB_CSRF'] ?? null);
    session_write_close();
    $action = $_GET['action'] ?? ($method === 'GET' ? 'list' : '');
    if (!is_string($action)) throw new Plateaux\TaskError('Action inconnue.', 404, 'not_found');
    $tasks = new Plateaux\Tasks(HubAuth\database());
    if ($method === 'GET' && $action === 'list') respond(200, ['tasks' => $tasks->all($user['id'])] + $tasks->listCatalog($user['id']));
    if ($method === 'POST') {
        if (!in_array($action, ['create', 'update', 'delete', 'create_list', 'rename_list'], true)) throw new Plateaux\TaskError('Action inconnue.', 404, 'not_found');
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) throw new Plateaux\TaskError('Le contenu doit être du JSON.', 415, 'invalid_input');
        $raw = file_get_contents('php://input', false, null, 0, 4097);
        if ($raw === false || strlen($raw) > 4096) throw new Plateaux\TaskError('La requête est trop volumineuse.', 413, 'invalid_input');
        try { $input = json_decode($raw, true, 8, JSON_THROW_ON_ERROR); }
        catch (JsonException) { throw new Plateaux\TaskError('Le JSON est invalide.', 400, 'invalid_input'); }
        if (!is_array($input) || array_is_list($input)) throw new Plateaux\TaskError('Cette requête est invalide.', 422, 'invalid_input');
        if ($action === 'create_list') respond(201, ['list' => $tasks->createList($user['id'], $input)]);
        if ($action === 'rename_list') respond(200, ['list' => $tasks->renameList($user['id'], $input)]);
        $task = match ($action) {
            'create' => $tasks->create($user['id'], $input),
            'update' => $tasks->update($user['id'], $input),
            'delete' => $tasks->remove($user['id'], $input),
            default => throw new Plateaux\TaskError('Action inconnue.', 404, 'not_found'),
        };
        respond($action === 'create' ? 201 : 200, ['task' => $task]);
    }
    throw new Plateaux\TaskError('Action inconnue.', 404, 'not_found');
} catch (Plateaux\TaskError | HubAuth\AuthError $error) {
    respond($error->status, ['error' => $error->getMessage(), 'code' => $error instanceof Plateaux\TaskError ? $error->kind : 'forbidden']);
} catch (Throwable $error) {
    error_log('Plateaux: ' . get_class($error));
    $missing = $error instanceof PDOException && (
        (in_array((string) $error->getCode(), ['42S02', 'HY000'], true) && preg_match('/todo_tasks|todo_lists|list_id/', $error->getMessage()))
        || ((string) $error->getCode() === '42S22' && str_contains($error->getMessage(), 'list_id'))
    );
    respond(503, ['error' => $missing ? 'Les tâches ne sont pas encore disponibles. Le propriétaire doit terminer l’installation.' : 'Les tâches sont momentanément indisponibles. Réessaie dans un instant.', 'code' => $missing ? 'setup_required' : 'unavailable']);
}
