# Melaz sur l’écran d’accueil de l’iPhone

Le site est préparé comme une application web installable : nom **Melaz**, icône du chevalier déjà utilisée par la favicon, démarrage sur le hub et ouverture sans barre d’adresse en mode application. La connexion et les préférences continuent d’utiliser la même base de données.

## Déployer

Transfère le contenu complet de `hub-projet` sur OVH, fichiers cachés compris. Garde les configurations privées hors de `www` et utilise `https://melaz.fr/`.

Les nouveaux fichiers importants sont :

- `manifest.webmanifest` : identité, icônes, page de départ et périmètre de l’application ;
- `sw.js` : gestion de la page hors connexion ;
- `offline.html` : page de repli publique, sans donnée personnelle ;
- `assets/pwa.js`, `assets/pwa.css` et `assets/pwa/` : activation, marges de sécurité de l’iPhone et icônes PNG ;
- `.htaccess` : types de contenu et mise à jour du manifeste et du service worker.

Aucun changement de base supplémentaire n’est nécessaire pour la PWA. Si la connexion persistante de la version précédente n’est pas encore installée, importe d’abord `auth/migrations/20261102-connexion-persistante.sql`, comme indiqué dans `auth/LISEZ-MOI.md`.

## Installer sur iPhone

1. Ouvre **Safari** et visite **https://melaz.fr/** après le déploiement.
2. Ouvre le menu **Partager** (selon ta version d’iOS, il peut être accessible dans le menu « Plus »).
3. Choisis **Sur l’écran d’accueil** ou **Ajouter à l’écran d’accueil**.
4. Active **Ouvrir comme app web** si cette option est proposée, conserve le nom **Melaz**, puis touche **Ajouter**.
5. Ouvre l’icône Melaz depuis l’écran d’accueil. Une connexion initiale peut être demandée dans cette application ; la connexion persistante reste ensuite gérée par le cookie du site.

Le nom et l’icône sont identiques même si l’ajout est effectué depuis la page de connexion ou un projet. La page de départ est le hub : la connexion s’affiche automatiquement si nécessaire. Le mode application garde les liens du hub et des deux projets dans le même périmètre.

## Réseau et confidentialité

Le service worker conserve uniquement `offline.html` et les trois icônes publiques. Il ne stocke ni page de compte connecté, ni calendrier, ni préférence, ni réponse API. Les requêtes de connexion, déconnexion et sauvegarde restent en ligne. Hors réseau, une page « On reprend dans un instant » permet de réessayer ; elle ne présente pas de données personnelles ni d’anciens horaires de métro.

Les données de l’utilisateur continuent d’être sauvegardées sur le serveur. Une connexion internet est nécessaire pour consulter les projets et effectuer des saisies. Les fichiers statiques habituels restent soumis au cache HTTP normal du navigateur.

Pour une prochaine mise à jour des ressources hors ligne, augmente la version `CACHE` dans `sw.js`. Le navigateur vérifie le service worker à l’ouverture ; aucune recharge forcée n’interrompt les formulaires. Les modifications du site restent disponibles au prochain chargement en ligne. Une modification de l’icône déjà ajoutée à l’écran d’accueil peut nécessiter de supprimer puis de réajouter le raccourci.

## Vérifications

- Les tests `tests/pwa.test.mjs` contrôlent le manifeste, les dimensions des icônes, les liens sur les quatre pages, l’absence de cache des données privées et le repli hors connexion.
- La configuration doit encore être vérifiée sur l’iPhone après déploiement : lancement depuis l’icône, connexion, navigation vers les projets et retour au hub.

Références : [Assistance Apple](https://support.apple.com/fr-ci/guide/iphone/iphea86e5236/ios), [manifestes web](https://web.dev/learn/pwa/web-app-manifest).
