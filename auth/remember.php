<?php
declare(strict_types=1);
namespace HubAuth;

// Le cookie contient un secret aléatoire ; seule son empreinte est conservée en base.
final class RememberTokens
{
    public const LIFETIME = 30 * 86400;
    private const GRACE = 30;
    public function __construct(private \PDO $db) {}
    public static function parts(mixed $cookie): ?array
    {
        if (!is_string($cookie) || !preg_match('/^([a-f0-9]{24}):([a-f0-9]{64})$/D', $cookie, $m)) return null;
        return [$m[1], hash('sha256', $m[2])];
    }
    public function issue(array $user, ?int $now = null): array
    {
        $now ??= time();
        $selector = bin2hex(random_bytes(12)); $secret = bin2hex(random_bytes(32));
        $expiry = $now + self::LIFETIME;
        $this->db->prepare('DELETE FROM hub_remember_tokens WHERE expires_at <= ?')->execute([$now]);
        $q = $this->db->prepare('INSERT INTO hub_remember_tokens (selector, user_id, auth_version, validator_hash, previous_hash, previous_until, expires_at) VALUES (?, ?, ?, ?, NULL, 0, ?)');
        $q->execute([$selector, $user['id'], $user['auth_version'], hash('sha256', $secret), $expiry]);
        return ['selector' => $selector, 'value' => $selector . ':' . $secret, 'expires' => $expiry];
    }
    private function record(string $selector): ?array
    {
        $q = $this->db->prepare('SELECT selector, user_id, auth_version, validator_hash, previous_hash, previous_until, expires_at FROM hub_remember_tokens WHERE selector = ?');
        $q->execute([$selector]); return $q->fetch(\PDO::FETCH_ASSOC) ?: null;
    }
    public function sessionValid(string $selector, int $id, int $version, ?int $now = null): bool
    {
        $row = $this->record($selector);
        return $row && (int) $row['user_id'] === $id && (int) $row['auth_version'] === $version && (int) $row['expires_at'] > ($now ?? time());
    }
    public function recover(mixed $cookie, Accounts $accounts, ?int $now = null): ?array
    {
        $now ??= time(); $parts = self::parts($cookie); if (!$parts) return null;
        [$selector, $hash] = $parts;
        $row = $this->record($selector); if (!$row) return null;
        $user = $accounts->user((int) $row['user_id']);
        if ((int) $row['expires_at'] <= $now || !$user || (int) $row['auth_version'] !== (int) $user['auth_version']) {
            $this->revoke($selector, (int) $row['user_id']); return null;
        }
        $current = hash_equals($row['validator_hash'], $hash);
        $previous = is_string($row['previous_hash']) && (int) $row['previous_until'] > $now && hash_equals($row['previous_hash'], $hash);
        if (!$current && !$previous) return null;
        $result = ['user' => $user, 'selector' => $selector, 'expires' => (int) $row['expires_at'], 'value' => null];
        if (!$current) return $result;
        $secret = bin2hex(random_bytes(32));
        // Une seule requête remplace le secret. Les requêtes simultanées disposent
        // d'une courte grâce et ne réécrivent pas le cookie avec une ancienne valeur.
        $q = $this->db->prepare('UPDATE hub_remember_tokens SET validator_hash = ?, previous_hash = ?, previous_until = ? WHERE selector = ? AND validator_hash = ? AND expires_at > ?');
        $q->execute([hash('sha256', $secret), $hash, $now + self::GRACE, $selector, $hash, $now]);
        if ($q->rowCount() === 1) { $result['value'] = $selector . ':' . $secret; return $result; }
        $fresh = $this->record($selector);
        return $fresh && (int) $fresh['expires_at'] > $now && (int) $fresh['previous_until'] > $now && is_string($fresh['previous_hash']) && hash_equals($fresh['previous_hash'], $hash) ? $result : null;
    }
    public function revoke(string $selector, int $id): void
    {
        $this->db->prepare('DELETE FROM hub_remember_tokens WHERE selector = ? AND user_id = ?')->execute([$selector, $id]);
    }
    public function revokePresented(mixed $cookie, ?int $now = null): void
    {
        $parts = self::parts($cookie); if (!$parts) return;
        [$selector, $hash] = $parts; $row = $this->record($selector); if (!$row) return;
        if (hash_equals($row['validator_hash'], $hash) || (is_string($row['previous_hash']) && (int) $row['previous_until'] > ($now ?? time()) && hash_equals($row['previous_hash'], $hash))) $this->revoke($selector, (int) $row['user_id']);
    }
}
function rememberCookie(mixed $value = null, int $expires = 0): void
{
    $remove = !is_string($value);
    if (!setcookie('melaz_remember', $remove ? '' : $value, ['expires' => $remove ? time() - 3600 : $expires, 'path' => '/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Lax'])) throw new AuthError('Le navigateur ne peut pas conserver la connexion.');
    if ($remove) unset($_COOKIE['melaz_remember']); else $_COOKIE['melaz_remember'] = $value;
}
function rememberDevice(array $user, RememberTokens $tokens): void
{
    $tokens->revokePresented($_COOKIE['melaz_remember'] ?? null);
    $issued = $tokens->issue($user);
    $_SESSION['hub_remember'] = $issued['selector'];
    rememberCookie($issued['value'], $issued['expires']);
}
function forgetDevice(array $user, RememberTokens $tokens): void
{
    if (is_string($_SESSION['hub_remember'] ?? null)) $tokens->revoke($_SESSION['hub_remember'], $user['id']);
    $tokens->revokePresented($_COOKIE['melaz_remember'] ?? null);
    rememberCookie(); unset($_SESSION['hub_remember']);
}
