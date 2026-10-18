<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/auth/lib.php';
HubAuth\protectedPage(__DIR__ . '/index.html');
