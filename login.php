<?php
declare(strict_types=1);
require __DIR__ . '/auth/lib.php';
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
try {
    if (HubAuth\currentUser()) { header('Location: ' . HubAuth\nextPath($_GET['next'] ?? null)); exit; }
} catch (Throwable $error) { /* La page reste accessible pour expliquer une configuration manquante. */ }
session_write_close();
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#e9e5d9">
  <meta name="robots" content="noindex,nofollow">
  <title>Votre prochaine idée. — Connexion</title>
  <link rel="icon" href="assets/favicon.jpg" type="image/jpeg">
  <link rel="stylesheet" href="assets/fonts.css">
  <link rel="stylesheet" href="assets/auth/login.css?v=20261018-auth-1">
  <script defer src="assets/auth/login.js?v=20261018-auth-1"></script>
</head>
<body>
<main class="login-scene">
  <div class="login-book" aria-labelledby="login-title">
    <span class="book-board" aria-hidden="true"></span><span class="page-stack" aria-hidden="true"></span><span class="under-sheet" aria-hidden="true"></span><span class="bookmark" aria-hidden="true"></span>
    <div class="login-sheet">
      <h1 id="login-title">Votre<br>prochaine idée.</h1>
      <form id="login-form" method="post" action="login.php">
        <label for="username">Identifiant</label>
        <input id="username" name="username" type="text" placeholder="Votre identifiant" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="64" required>
        <label for="password">Mot de passe</label>
        <div class="password-field"><input id="password" name="password" type="password" placeholder="Votre mot de passe" autocomplete="current-password" maxlength="1024" required><button id="toggle-password" type="button" aria-label="Afficher le mot de passe" aria-pressed="false"><svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" hidden><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.1 6.1A21 21 0 0 0 2 12s3.5 7 10 7a13 13 0 0 0 5.9-1.9M10 10a3 3 0 0 0 4 4"/></svg></button></div>
        <button id="login-submit" class="enter" type="submit"><span>Ouvrir mon espace</span><span aria-hidden="true">→</span></button>
        <p id="login-error" role="alert"></p>
      </form>
      <noscript><p>Active JavaScript pour te connecter.</p></noscript>
    </div><span class="folded-corner" aria-hidden="true"></span>
  </div>
</main>
</body>
</html>
