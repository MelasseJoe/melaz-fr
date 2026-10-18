# Entre deux rames — Lin & café

Le deuxième carnet du hub ouvre `projets/en-route/`. La page reprend les deux billets alignés et la palette Lin & café : fond lin, papier crème, encre café et messages sur fond gris chaud.

## Ajouter ta clé sur OVH Starter

1. Transfère le contenu de `hub-projet` dans le dossier public de ton hébergement, généralement `www`.
2. Un fichier **`en-route-config.php`** est déjà préparé dans le dossier de travail `melaz`, à côté de `hub-projet`. Utilise-le. Si tu repars du seul dossier déployable, duplique `projets/en-route/config.example.php` et nomme la copie `en-route-config.php`.
3. Dans cette copie, remplace uniquement `COLLER_VOTRE_CLE_PRIM_ICI` par ta clé :

   ```php
   'api_key' => 'ta_cle_PRIM',
   ```

4. Dépose **cette copie au-dessus de `www`**, et non dans `www` :

   ```text
   /home/ton-compte/
   ├── en-route-config.php        ← ta clé, hors du site public
   ├── .en-route-cache/           ← créé automatiquement par PHP
   └── www/
       ├── index.html
       ├── projets.js
       ├── assets/
       └── projets/
           ├── tempo/
           └── en-route/
               ├── index.html
               ├── api.php
               └── …
   ```

5. Ouvre le deuxième carnet du hub, puis clique sur **Actualiser** ou recharge la page.

Le cache est créé automatiquement à côté du fichier de configuration. Si PHP ne peut pas écrire dans ce dossier, crée `.en-route-cache` via ton client SFTP et donne-lui les droits 700 ; ajuste `cache_dir` dans le fichier privé si ton hébergement utilise un autre chemin. PHP 8.1 minimum et l’extension cURL sont nécessaires ; aucune base de données n’est requise pour ce projet.

Une configuration par variables d’environnement est aussi possible : `PRIM_API_KEY` pour la clé, `EN_ROUTE_CONFIG` pour le chemin absolu du fichier privé. Le repli `projets/en-route/config.php` est pris en charge et refusé en HTTP par le `.htaccess`, mais la configuration **hors de `www`** reste celle recommandée. Dans le cas de ce repli, remplace `cache_dir` par `dirname(__DIR__, 3) . '/.en-route-cache'` afin de garder les caches privés.

## Ce que fait la page

- Sélection de toutes les lignes de métro retournées par le référentiel PRIM, puis d’une station desservie.
- Directions déduites des passages réellement communiqués par PRIM à cette station : aucun terminus n’est inventé. Si PRIM ne communique aucun passage, la direction est indisponible jusqu’à un nouveau relevé.
- Trois prochains passages par sens, affichés simultanément sous la station, avec éventuel quai et distinction entre prévision temps réel et horaire théorique.
- Messages des écrans de la station et de la ligne, dédoublonnés. Le service ne garantit pas un filtre par direction : les messages sont présentés comme tous sens, sauf indication dans leur texte.
- Perturbations actuellement applicables aux lignes de métro et de RER du flux Navitia, en excluant les alertes concernant les ascenseurs, escalators et autres équipements. Les trois premières sont visibles ; les autres restent accessibles dans « Voir les … perturbations ». Les périodes futures ou terminées sont exclues. Une erreur de collecte ne devient jamais « aucune perturbation ».
- Recherche de stations, adresses et lieux avec suggestions ; jusqu’à trois itinéraires, étapes, directions, correspondances, marche et horaires pour un départ maintenant. Le calcul peut proposer d’autres modes que le métro.
- Dernière ligne et station mémorisées **dans ce navigateur**. Les adresses saisies ne sont pas mémorisées côté navigateur.
- Bouton de retour au hub ; thème clair ou sombre selon le système ; adaptation mobile et clavier.

Sans clé, la page affiche un état « connexion non activée » : aucun horaire, message ou trajet fictif n’est présenté comme réel. Une clé refusée ou un service non autorisé produit un message explicite. Les appels authentifiés avec ta clé doivent être vérifiés après son ajout sur ton hébergement.

## Services PRIM utilisés

En-tête serveur `apikey`, jamais transmis dans le HTML, le JavaScript ou une URL publique.

| Fonction | Point d’entrée PRIM |
| --- | --- |
| Lignes de métro | `/marketplace/v2/navitia/physical_modes/physical_mode%3AMetro/lines` |
| Arrêts d’une ligne | `/marketplace/v2/navitia/lines/{line}/stop_points` |
| Passages | `/marketplace/stop-monitoring?MonitoringRef=…&LineRef=…` |
| Écrans | `/marketplace/general-message?StopPointRef=…` puis une requête distincte avec `LineRef` |
| Perturbations | `/marketplace/v2/navitia/line_reports/line_reports` avec pagination complète |
| Lieux / itinéraires | `/marketplace/v2/navitia/places` et `/marketplace/v2/navitia/journeys` |

Documentation officielle vérifiée le 16 octobre 2026 : [routes Navitia v2](https://prim.iledefrance-mobilites.fr/content/files/2024/01/-FR--Documentation-fonctionnelle-PRIM---Prise-en-main-des-API-Navitia-v2-2.pdf), [passages](https://prim.iledefrance-mobilites.fr/fr/apis/idfm-ivtr-requete_unitaire), [messages des écrans](https://prim.iledefrance-mobilites.fr/fr/apis/idfm-ivtr-info_trafic), [informations trafic](https://prim.iledefrance-mobilites.fr/fr/apis/idfm-navitia-line_reports-v2), [Navitia](https://doc.navitia.io/).

## Cache et quotas

Les requêtes sont partagées entre les visiteurs : référentiel 24 h, passages 60 s, écrans 180 s, trafic 300 s, suggestions 1 h, calcul d’itinéraire 60 s. Le navigateur suspend l’actualisation en arrière-plan et actualise les passages environ toutes les 65 secondes. Les horaires de tous les sens sont obtenus dans la même recherche, sans appel supplémentaire par direction.

Les requêtes sortantes sont espacées d’au moins 260 ms et comptabilisées par service et par clé. La configuration limite par défaut chaque service à 900 appels/jour, selon la date de Paris ; lieux, lignes, arrêts et itinéraires partagent le même compteur `generic`. Cette marge ne compte pas l’utilisation de la même clé dans d’autres applications. Ajuste les limites uniquement d’après les quotas effectifs de ton compte PRIM. Les réponses 429 déclenchent une pause, pas une boucle de tentatives. Les erreurs sont brièvement mises en cache. Aucun ancien horaire n’est servi en remplacement silencieux d’une erreur.

La disponibilité et la couverture dépendent de PRIM et des transporteurs. Un résultat vide n’est pas une garantie d’absence de service. Les temps d’attente et heures d’arrivée sont des estimations.

## Confidentialité et déploiement

Les fichiers de configuration privés et `.en-route-cache` sont exclus par les `.gitignore`. Les SQL personnels existants restent exclus. Le cache peut contenir des recherches de lieux et de trajets : conserve-le hors de `www`. Le site n’a pas encore de login ; les visiteurs du hub peuvent consulter ces services et consommer le budget commun, comme prévu pour cette première version.

Les polices libres DM Serif Display et DM Mono sont incluses dans `assets`, avec leurs licences OFL. DM Sans est réutilisée depuis les ressources locales du hub. Aucun CDN, aucune compilation, aucune archive ZIP.
