# melaz-fr — Hub de projets

Hub personnel avec carnets animés, fond discret et compagnon illustré. Le premier carnet ouvre Tempo, un calendrier de sport avec sauvegarde PHP/MySQL, historique annuel, séries et statistiques.

## Déploiement sur OVH

Le site est à la racine du dépôt, sans compilation. Transférer les fichiers du site, `assets/`, `projets/` et les fichiers `.htaccess` dans le répertoire public de l’hébergement. Le dossier local prêt à déployer s’appelle `hub-projet`.

Pour Tempo, importer `projets/tempo/schema.sql` puis configurer la connexion MySQL à partir de `projets/tempo/config.example.php`. Conserver les identifiants hors du dossier public et hors de Git. Les instructions complètes sont dans [la notice Tempo](projets/tempo/LISEZ-MOI.md).

## Personnalisation et vérification

- Modifier `projets.js` pour les noms, liens et couvertures des carnets.
- Lire [la notice du hub](LISEZ-MOI.md).
- Relancer les tests avec `node --test tests/tempo.test.mjs` depuis le dépôt.

La connexion PHP/MySQL doit être vérifiée sur l’hébergement après configuration.
