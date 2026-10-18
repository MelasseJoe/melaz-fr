<?php
declare(strict_types=1);
namespace HubAuth;

final class AuthError extends \RuntimeException
{
    public function __construct(string $message, public int $status = 503) { parent::__construct($message); }
}
function database(): \PDO
{
    static $db;
    if ($db instanceof \PDO) return $db;
    $root = dirname(__DIR__);
    $path = getenv('HUB_CONFIG') ?: dirname($root) . '/hub-config.php';
    if (!is_file($path)) $path = getenv('TEMPO_CONFIG') ?: dirname($root) . '/tempo-config.php';
    if (!is_file($path)) $path = $root . '/projets/tempo/config.php';
    if (!is_file($path)) throw new AuthError('Configure la base de données et importe auth/schema.sql avant de te connecter.');
    $config = require $path;
    if (!is_array($config)) throw new AuthError('La configuration de la base de données est invalide.');
    // Une connexion PDO fournie par la configuration privée permet les tests locaux isolés.
    if (($config['connection'] ?? null) instanceof \PDO) return $db = $config['connection'];
    foreach (['host', 'database', 'username', 'password'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key])) throw new AuthError('La configuration de la base de données est incomplète.');
    }
    $port = (int) ($config['port'] ?? 3306);
    if ($port < 1 || $port > 65535 || preg_match('/[;\x00-\x1f]/', $config['host'] . $config['database'])) throw new AuthError('La configuration de la base de données est invalide.');
    return $db = new \PDO('mysql:host=' . $config['host'] . ';port=' . $port . ';dbname=' . $config['database'] . ';charset=utf8mb4', $config['username'], $config['password'], [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_EMULATE_PREPARES => false, \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC, \PDO::ATTR_TIMEOUT => 10]);
}
function basePath(): string
{
    $script = $_SERVER['SCRIPT_NAME'] ?? '/index.php';
    $prefix = preg_replace('~/(?:auth/[^/]+|projets/(?:tempo|en-route)/[^/]*|(?:index|login)\.(?:php|html))$~', '', $script);
    return rtrim(is_string($prefix) && $prefix !== $script ? $prefix : '', '/') . '/';
}
function nextPath(mixed $value): string
{
    $base = basePath();
    if (!is_string($value)) return $base;
    $allowed = [$base, $base . 'index.php', $base . 'index.html'];
    foreach (['tempo', 'en-route'] as $project) foreach (['', 'index.php', 'index.html'] as $file) $allowed[] = $base . 'projets/' . $project . '/' . $file;
    return in_array($value, $allowed, true) ? $value : $base;
}
function startSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '43200');
    session_name('melaz_session');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Lax']);
    if (!session_start()) throw new AuthError('La session est indisponible. Réessaie dans un instant.');
    if (!isset($_SESSION['hub_csrf'])) $_SESSION['hub_csrf'] = bin2hex(random_bytes(32));
}
function csrf(): string { startSession(); return $_SESSION['hub_csrf']; }
function checkCsrf(?string $token): void
{
    if (strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site' || !is_string($token) || !hash_equals(csrf(), $token)) throw new AuthError('La session a expiré. Recharge la page avant de réessayer.', 403);
}
function clearIdentity(): void
{
    unset($_SESSION['hub_user'], $_SESSION['tempo_csrf']);
    $_SESSION['hub_csrf'] = bin2hex(random_bytes(32));
}
function passwordMatches(string $password, string $hash): bool
{
    if (str_starts_with($hash, 'pbkdf2-sha256$')) {
        $parts = explode('$', $hash);
        if (count($parts) !== 4 || $parts[1] !== '600000') return false;
        $salt = base64_decode($parts[2], true); $expected = base64_decode($parts[3], true);
        return is_string($salt) && strlen($salt) === 16 && is_string($expected) && strlen($expected) === 32 && hash_equals($expected, hash_pbkdf2('sha256', $password, $salt, 600000, 32, true));
    }
    // Bcrypt ignore les octets après le 72e : ne jamais accepter une troncature.
    if (str_starts_with($hash, '$2') && strlen($password) > 72) return false;
    return password_verify($password, $hash);
}
final class Accounts
{
    public function __construct(private \PDO $db) {}
    public function user(int $id): ?array
    {
        $q = $this->db->prepare('SELECT id, username, display_name, active, auth_version FROM hub_users WHERE id = ?');
        $q->execute([$id]); $row = $q->fetch(\PDO::FETCH_ASSOC);
        return $row && (int) $row['active'] === 1 ? $row : null;
    }
    public function consumeAttempt(string $username, string $ip, int $now): void
    {
        foreach (['ip:' . $ip => 40, 'account:' . $username . ':' . $ip => 8] as $source => $limit) {
            $key = hash('sha256', $source . ':' . intdiv($now, 900));
            $sql = 'INSERT INTO hub_login_attempts (bucket_key, attempts, expires_at) VALUES (?, 1, ?) ';
            $sql .= $this->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite' ? 'ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1' : 'ON DUPLICATE KEY UPDATE attempts = attempts + 1';
            $this->db->prepare($sql)->execute([$key, $now + 1800]);
            $q = $this->db->prepare('SELECT attempts FROM hub_login_attempts WHERE bucket_key = ?'); $q->execute([$key]);
            if ((int) $q->fetchColumn() > $limit) throw new AuthError('Trop de tentatives. Patiente 15 minutes avant de réessayer.', 429);
        }
        $this->db->prepare('DELETE FROM hub_login_attempts WHERE expires_at < ?')->execute([$now]);
    }
    public function authenticate(string $username, string $password, string $ip): array
    {
        $username = strtolower(trim($username));
        if (strlen($password) > 1024 || !preg_match('/^[a-z0-9._-]{3,64}$/D', $username)) throw new AuthError('Identifiant ou mot de passe incorrect.', 401);
        $this->consumeAttempt($username, $ip, time());
        $q = $this->db->prepare('SELECT id, username, display_name, password_hash, active, auth_version FROM hub_users WHERE username = ?'); $q->execute([$username]);
        $row = $q->fetch(\PDO::FETCH_ASSOC);
        $dummy = '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi';
        $valid = passwordMatches($password, $row['password_hash'] ?? $dummy);
        if (!$row || !$valid || (int) $row['active'] !== 1) throw new AuthError('Identifiant ou mot de passe incorrect.', 401);
        if (strlen($password) <= 72 && password_needs_rehash($row['password_hash'], PASSWORD_BCRYPT, ['cost' => 12])) {
            $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $this->db->prepare('UPDATE hub_users SET password_hash = ? WHERE id = ? AND password_hash = ?')->execute([$hash, $row['id'], $row['password_hash']]);
        }
        unset($row['password_hash']); return $row;
    }
    public function settings(int $id): array
    {
        $q = $this->db->prepare('SELECT namespace, settings_json FROM hub_user_settings WHERE user_id = ?'); $q->execute([$id]); $result = [];
        foreach ($q->fetchAll(\PDO::FETCH_ASSOC) as $row) $result[$row['namespace']] = json_decode($row['settings_json'], true) ?: [];
        return $result;
    }
    public function saveSettings(int $id, string $namespace, array $settings): array
    {
        if ($namespace !== 'en-route') throw new AuthError('Préférence inconnue.', 422);
        $line = $settings['line'] ?? ''; $stop = $settings['stop'] ?? '';
        if (!is_string($line) || !is_string($stop) || !preg_match('/^(?:line:IDFM:C\d+)?$/D', $line) || !preg_match('/^(?:stop_(?:area|point):IDFM:[a-zA-Z0-9:_-]{1,120})?$/D', $stop) || ($line === '' && $stop !== '')) throw new AuthError('La sélection de transport est invalide.', 422);
        $value = ['line' => $line, 'stop' => $stop];
        $sql = 'INSERT INTO hub_user_settings (user_id, namespace, settings_json) VALUES (?, ?, ?) ';
        $sql .= $this->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite' ? 'ON CONFLICT(user_id, namespace) DO UPDATE SET settings_json = excluded.settings_json' : 'ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)';
        $this->db->prepare($sql)->execute([$id, $namespace, json_encode($value, JSON_THROW_ON_ERROR)]);
        return $value;
    }
}
function currentUser(?Accounts $accounts = null): ?array
{
    startSession(); $session = $_SESSION['hub_user'] ?? null;
    if (!is_array($session)) return null;
    $now = time();
    if ($now - ($session['seen'] ?? 0) > 43200 || $now - ($session['created'] ?? 0) > 604800) { clearIdentity(); return null; }
    $user = ($accounts ?? new Accounts(database()))->user((int) ($session['id'] ?? 0));
    if (!$user || (int) $user['auth_version'] !== (int) ($session['version'] ?? 0)) { clearIdentity(); return null; }
    $_SESSION['hub_user']['seen'] = $now;
    return ['id' => (int) $user['id'], 'username' => $user['username'], 'displayName' => $user['display_name']];
}
function establish(array $user): void
{
    startSession();
    if (!session_regenerate_id(true)) throw new AuthError('La session ne peut pas être ouverte.');
    $_SESSION = ['hub_csrf' => bin2hex(random_bytes(32)), 'hub_user' => ['id' => (int) $user['id'], 'version' => (int) $user['auth_version'], 'created' => time(), 'seen' => time()]];
}
function requireUser(bool $json = true): array
{
    header('Cache-Control: no-store, private');
    try { $user = currentUser(); }
    catch (\Throwable $error) {
        error_log('Hub: database unavailable');
        http_response_code(503);
        if ($json) { header('Content-Type: application/json; charset=utf-8'); echo json_encode(['error' => 'La connexion à la base de données est indisponible.', 'code' => 'unavailable']); }
        else { header('Content-Type: text/html; charset=utf-8'); echo '<p>La connexion à la base de données est indisponible. Réessaie dans un instant.</p>'; }
        exit;
    }
    if ($user) return $user;
    http_response_code($json ? 401 : 302);
    if ($json) { header('Content-Type: application/json; charset=utf-8'); echo json_encode(['error' => 'Connecte-toi pour accéder à ton espace.', 'code' => 'login_required']); }
    else header('Location: ' . basePath() . 'login.php?next=' . rawurlencode(nextPath(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH))));
    exit;
}
function protectedPage(string $file): never
{
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    requireUser(false); session_write_close();
    header('Content-Type: text/html; charset=utf-8'); readfile($file); exit;
}
