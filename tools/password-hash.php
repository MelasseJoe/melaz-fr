<?php
// Usage local : php tools/password-hash.php. Ne pas placer cet outil dans www.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
fwrite(STDERR, "Mot de passe (12 à 72 octets ; utilise un terminal privé) : ");
$password = rtrim((string) fgets(STDIN), "\r\n");
if (strlen($password) < 12 || strlen($password) > 72) { fwrite(STDERR, "Longueur invalide.\n"); exit(1); }
echo password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]) . PHP_EOL;
