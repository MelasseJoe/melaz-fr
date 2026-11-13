# Bibliothèque — Bordeaux classique

Le troisième carnet du hub ouvre `projets/bibliotheque/`. Fond bordeaux, tablettes fines en laiton et couvertures droites ; quatre livres par rangée sur ordinateur, deux sur mobile. Les lectures terminées sont présentées de la plus récente à la plus ancienne, avec leur date de fin.

## Déployer sur OVH Starter

1. Dans phpMyAdmin, sélectionne **la même base que celle du hub et de Tempo**.
2. Importe le fichier local `projets/bibliotheque/schema.sql`, une seule fois. Il crée uniquement `library_books` et ne modifie aucune table existante. La table `hub_users` doit déjà exister.
3. Transfère le contenu à jour de `hub-projet` sur ton hébergement, en conservant les fichiers cachés `.htaccess`. La configuration privée du hub reste à sa place au-dessus de `www`.
4. Ouvre le troisième carnet. Aucun nouveau compte, identifiant de base ou clé API n’est nécessaire.

**Le fichier SQL est exclu de GitHub**, comme les autres fichiers SQL. Garde-le sur ton ordinateur pour l’import manuel ; il n’est pas nécessaire dans le dossier public du serveur. Aucun import n’a été exécuté automatiquement sur OVH.

PHP 8.1 minimum, PDO MySQL et cURL. La bibliothèque utilise `HubAuth\database()` et les sessions existantes. Les pages HTML passent par PHP ; les lectures et écritures API nécessitent une connexion. Toutes les écritures vérifient le jeton CSRF. L’identifiant de compte provient exclusivement de la session.

## Utilisation

- **Ajouter un livre** : recherche par titre, auteur ou ISBN, puis choix du résultat, date de fin et souvenir facultatif. Le titre et l’auteur restent corrigeables avant l’ajout.
- **Saisie manuelle** : disponible si un livre manque au catalogue ou si Open Library est indisponible. Une couverture typographique prend la place d’une image absente.
- **Ouvrir un livre** : grande couverture, date et souvenir modifiables. La sauvegarde conserve la fiche à l’écran.
- **Choisir l’édition** : une fenêtre affiche les éditions disponibles avec leurs couvertures, éditeurs, dates de publication, langues, formats et ISBN lorsqu’ils sont renseignés. Les éditions suivantes se chargent à la demande. Le bouton « Changer d’édition » permet aussi de corriger une fiche existante avant de l’enregistrer. Les colonnes existantes suffisent pour conserver ce choix.
- **Retirer un livre** : confirmation, puis possibilité d’annuler dans la notification. Le retrait est logique en base (`deleted_at`), pas une suppression physique.
- Une requête répétée après une coupure ne crée pas deux exemplaires. Un changement simultané sur un autre appareil est signalé et ne remplace pas silencieusement la version plus récente.

La base contient uniquement les livres ajoutés par chaque utilisateur et leurs métadonnées utiles, références Open Library, dates et souvenirs. Le catalogue complet et les images de couverture ne sont pas copiés en base. Les images viennent directement de `covers.openlibrary.org` par OLID pour les éditions choisies, ou par CoverID pour les fiches sans référence d’édition ; une image manquante conserve une couverture typographique lisible. Aucune donnée personnelle n’est stockée dans `localStorage` ou dans le cache de la PWA.

## Catalogue et réseau

La recherche PHP appelle `https://openlibrary.org/search.json`, avec `lang=fr` et douze résultats au maximum. Le choix d’édition interroge `/works/{identifiant}/editions.json`, par pages de trente. La couverture est demandée directement par l’identifiant de l’édition choisie (OLID). Une image manquante conserve la couverture typographique. Les métadonnées dépendent du catalogue Open Library. Aucun appel n’est lancé à chaque frappe : l’utilisateur valide sa recherche.

Les réponses publiques sont mises en cache 24 h dans **`.open-library-cache` au-dessus du dossier public**, créé automatiquement. Ce dossier doit être accessible en écriture par PHP ; si nécessaire, crée-le en SFTP avec des droits 700. La variable d’environnement `LIBRARY_CACHE_DIR` permet un autre chemin privé. Ce cache ne contient aucun identifiant d’utilisateur, date de lecture ni souvenir. Les appels sortants sont espacés d’au moins 1,1 seconde pour l’ensemble du site. Une réponse 429 ou une panne donne un message explicite, sans résultat fictif et sans boucle de tentatives.

Un User-Agent identifie l’application et son URL publique. Le plafond conservateur d’une requête/seconde est utilisé ; pour une utilisation régulière plus importante, l’en-tête doit aussi préciser un contact réel suivant les consignes Open Library. Aucun contact personnel n’est inventé par le code.

Documentation vérifiée le 4 novembre 2026 : [recherche](https://openlibrary.org/dev/docs/api/search), [couvertures](https://openlibrary.org/dev/docs/api/covers), [bon usage et limites](https://openlibrary.org/developers/api).
