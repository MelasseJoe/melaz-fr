<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
function reply(int $status, array $data): never { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit; }
try {
    $action = $_GET['action'] ?? 'me';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!is_string($action) || !in_array($action, ['me', 'login', 'register', 'logout', 'settings'], true)) throw new HubAuth\AuthError('Cette action n’existe pas.', 404);
    if (($action === 'me' && $method !== 'GET') || ($action !== 'me' && $method !== 'POST')) { header('Allow: ' . ($action === 'me' ? 'GET' : 'POST')); throw new HubAuth\AuthError('Méthode non autorisée.', 405); }
    HubAuth\startSession();
    if ($action === 'me') {
        $user = HubAuth\currentUser();
        $csrf = HubAuth\csrf(); session_write_close();
        $settings = $user ? (new HubAuth\Accounts(HubAuth\database()))->settings($user['id']) : [];
        reply(200, ['user' => $user, 'csrf' => $csrf, 'settings' => $settings]);
    }
    HubAuth\checkCsrf($_SERVER['HTTP_X_HUB_CSRF'] ?? null);
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) throw new HubAuth\AuthError('Le contenu doit être du JSON.', 415);
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if (!is_string($raw) || strlen($raw) > 4096) throw new HubAuth\AuthError('Requête trop volumineuse.', 413);
    try { $input = json_decode($raw, true, 8, JSON_THROW_ON_ERROR); } catch (JsonException $e) { throw new HubAuth\AuthError('La requête est invalide.', 400); }
    if (!is_array($input)) throw new HubAuth\AuthError('La requête est invalide.', 400);
    if ($action === 'login' || $action === 'register') {
        $registering = $action === 'register';
        $username = $input['username'] ?? null;
        $password = $input['password'] ?? null;
        if (!is_string($username) || !is_string($password)) {
            throw new HubAuth\AuthError($registering ? 'Renseigne ton pseudo et ton mot de passe.' : 'Renseigne ton identifiant et ton mot de passe.', 422);
        }
        $accounts = new HubAuth\Accounts(HubAuth\database());
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        if ($registering) {
            if (HubAuth\currentUser($accounts)) throw new HubAuth\AuthError('Tu es déjà connecté. Déconnecte-toi pour créer un autre compte.', 409);
            $account = $accounts->register($username, $password, $ip);
        } else {
            // Le verrou de session ne reste pas ouvert pendant le calcul du mot de passe.
            session_write_close();
            $account = $accounts->authenticate($username, $password, $ip);
        }
        try {
            HubAuth\establish($account);
            HubAuth\rememberDevice($account, $accounts->tokens());
        } catch (Throwable $error) {
            if (!$registering) throw $error;
            error_log('Hub registration session error: ' . get_class($error));
            throw new HubAuth\AuthError('Ton compte a été créé. Reviens à la connexion pour ouvrir ton espace.');
        }
        reply($registering ? 201 : 200, ['next' => HubAuth\nextPath($input['next'] ?? null)]);
    }
    $user = HubAuth\requireUser();
    if ($action === 'logout') {
        HubAuth\forgetDevice($user, (new HubAuth\Accounts(HubAuth\database()))->tokens());
        $_SESSION = []; $params = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $params['path'], 'secure' => $params['secure'], 'httponly' => true, 'samesite' => 'Lax']);
        session_destroy(); reply(200, ['ok' => true]);
    }
    session_write_close();
    if (!is_string($input['namespace'] ?? null) || !is_array($input['settings'] ?? null)) throw new HubAuth\AuthError('La préférence est invalide.', 422);
    $value = (new HubAuth\Accounts(HubAuth\database()))->saveSettings($user['id'], $input['namespace'], $input['settings']);
    reply(200, ['settings' => $value]);
} catch (HubAuth\AuthError $error) {
    if ($error->status === 429) header('Retry-After: 900');
    reply($error->status, ['error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('Hub authentication error: ' . get_class($error));
    reply(503, ['error' => 'La connexion est indisponible. Vérifie la configuration de la base et l’import de auth/schema.sql.']);
}
