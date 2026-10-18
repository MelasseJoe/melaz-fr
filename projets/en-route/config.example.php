<?php
// Copie ce fichier vers en-route-config.php AU-DESSUS du dossier public www.
// Exemple OVH : /home/ton-compte/en-route-config.php (site dans /home/ton-compte/www).
// Ne mets jamais la clé dans un fichier JavaScript, HTML ou dans GitHub.
return [
    'api_key' => 'COLLER_VOTRE_CLE_PRIM_ICI',
    // Cache privé au-dessus de www ; créé automatiquement avec les droits 0700.
    // Dans le fichier placé au-dessus de www, __DIR__ désigne le dossier privé.
    'cache_dir' => __DIR__ . '/.en-route-cache',
    // Garde une marge sous les quotas PRIM par défaut. Les itinéraires et le
    // référentiel partagent le budget generic. Adapter seulement selon ton compte.
    'daily_limits' => ['generic' => 900, 'departures' => 900, 'messages' => 900, 'traffic' => 900],
];
