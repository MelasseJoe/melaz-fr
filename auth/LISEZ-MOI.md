# Connexion au hub et comptes personnels

La page de connexion est `login.php`. Le hub, Tempo et Entre deux rames utilisent une seule session PHP. Aucun formulaire d’inscription n’est prévu : les utilisateurs se créent à la main dans phpMyAdmin.

## Installation sur OVH Starter

1. Fais une sauvegarde de ta base avant toute intervention.
2. Dans phpMyAdmin, sélectionne **la base déjà utilisée par Tempo**, puis importe le fichier `auth/schema.sql` du dossier `hub-projet`. Il crée `hub_users`, `hub_user_settings` et `hub_login_attempts`. Il ne supprime ni ne modifie les séances existantes. Il crée `tempo_sport_days` seulement si elle manque.
3. Le hub réutilise automatiquement le fichier privé `tempo-config.php` déjà placé **au-dessus de `www`**. Aucun nouvel identifiant de base n’est nécessaire. Si tu préfères un fichier séparé, copie `auth/config.example.php` en `hub-config.php` au-dessus de `www`, avec les mêmes paramètres MySQL. `HUB_CONFIG` peut aussi indiquer un chemin absolu. Le même accès à la base est utilisé par Tempo et la connexion.
4. Crée ton premier utilisateur avec **id = 1**, comme indiqué ci-dessous. Les anciennes séances appartiennent déjà à `user_id = 1` : ne réimporte pas ton historique, ne change pas leurs identifiants.
5. Transfère le **contenu complet** de `hub-projet` dans `www`, y compris les fichiers cachés `.htaccess` des trois pages et du dossier `auth`. Accède au site en **HTTPS**. Vérifie qu’une fenêtre privée qui ouvre `/`, `/index.html`, `/projets/tempo/` ou `/projets/en-route/index.html` arrive à la connexion. Si le serveur signale une erreur 500, vérifie que la réécriture Apache est active et que tous les `.htaccess` ont bien été transférés.

Le serveur charge `index.php` et protège aussi les anciennes adresses `index.html`. Les feuilles HTML restent dans le dossier pour faciliter leur édition ; elles ne doivent pas être servies en contournant les règles `.htaccess`.

## Activer la connexion persistante sur une installation existante

1. Dans phpMyAdmin, sélectionne la base utilisée par le hub et importe **`auth/migrations/20261102-connexion-persistante.sql`**. Cette migration ajoute seulement `hub_remember_tokens` : elle ne change ni les comptes, ni les mots de passe, ni les séances.
2. Déploie la version à jour du dossier `hub-projet`, y compris le dossier `auth` et ses fichiers cachés. Pour une nouvelle installation, le schéma complet `auth/schema.sql` inclut déjà cette table.
3. Les sessions encore ouvertes reçoivent automatiquement le nouveau cookie à leur prochaine visite. Une personne déjà déconnectée doit saisir son mot de passe une dernière fois.

La connexion est conservée automatiquement **30 jours sur chaque navigateur**, à compter de sa dernière connexion par mot de passe (ou de l’activation pour une session déjà ouverte). La fermeture du navigateur ou l’expiration du fichier de session PHP ne demandent plus de ressaisir le mot de passe pendant cette durée. L’échéance des 30 jours ne se prolonge pas à chaque visite.

- **Déconnexion** : le cookie et le jeton du navigateur concerné sont supprimés ; ses anciens jetons ne peuvent plus reconnecter le compte. Les autres appareils restent connectés.
- **Désactivation ou changement de `auth_version`** : les sessions et les jetons persistants du compte sont refusés. Pour un changement de mot de passe, augmente toujours `auth_version` comme indiqué ci-dessous.
- **Révocation manuelle d’un appareil** : supprime sa ligne dans `hub_remember_tokens`. Pour déconnecter tous les appareils d’un utilisateur, augmente son `auth_version` de 1.
- **Suppression des cookies / navigation privée** : une nouvelle connexion pourra être nécessaire.

Le cookie `melaz_remember` est HTTP-only, SameSite=Lax, Secure en HTTPS, avec une expiration de 30 jours. Il ne contient ni mot de passe ni clé API. Son secret aléatoire est haché en base et renouvelé quand il recrée une session. Une grâce de 30 secondes gère les ouvertures simultanées de plusieurs onglets, sans écraser le nouveau cookie. Les jetons expirés sont nettoyés lors de l’émission de nouveaux jetons.

Les fichiers SQL restent locaux et exclus de GitHub. La base OVH n’est pas modifiée automatiquement par le code : importe la migration **avant** de déployer cette version.

## Créer le propriétaire à la main

### Préparer le mot de passe

Dans le dossier de travail `melaz`, ouvre **`tools/password-hash.html` directement sur ton ordinateur**. Ne le transfère pas sur le serveur. Saisis un mot de passe unique de 12 à 72 octets et clique sur « Générer l’empreinte ». Copie le résultat complet. Aucun mot de passe n’est transmis au réseau ou sauvegardé par cet outil.

L’empreinte est au format `pbkdf2-sha256$600000$…$…`. PHP la vérifie à la première connexion, puis la remplace automatiquement par une empreinte bcrypt. On peut aussi utiliser `php tools/password-hash.php` sur un ordinateur disposant de PHP, ou `password_hash(..., PASSWORD_BCRYPT, ['cost' => 12])` dans un environnement PHP privé. **Ne saisis jamais le mot de passe en clair dans la base. N’utilise ni MD5 ni SHA-256 simple.**

### Insérer le compte

Dans phpMyAdmin, ouvre `hub_users` → **Insérer**, puis renseigne :

| Colonne | Valeur |
| --- | --- |
| `id` | **1**, pour toi et ton historique actuel |
| `username` | Identifiant en minuscules, 3 à 64 caractères : lettres `a-z`, chiffres, point, tiret ou souligné. Exemple : `arnaud` |
| `display_name` | Nom affiché dans le hub, par exemple `Arnaud` |
| `password_hash` | L’empreinte entière générée localement |
| `active` | `1` |
| `auth_version` | `1` |
| `created_at` | Laisser la valeur par défaut |

Si l’identifiant 1 existe déjà, modifie cette ligne au lieu de l’insérer de nouveau. Ne crée pas de deuxième compte propriétaire en changeant l’identifiant : tu verrais un calendrier vide.

Pour un **autre utilisateur**, insère une nouvelle ligne en laissant `id` vide (AUTO_INCREMENT). Donne-lui son propre identifiant, nom et empreinte. Il commence avec un calendrier et des préférences de transport vides.

## Modifier ou désactiver un compte

- **Changer le mot de passe** : génère une nouvelle empreinte locale, remplace `password_hash`, puis augmente `auth_version` de 1. Les sessions précédentes seront refusées à leur prochaine requête.
- **Désactiver** : mets `active` à `0`. Réactiver se fait avec `1` ; augmente aussi `auth_version` pour invalider toutes les anciennes sessions.
- **Changer le nom affiché** : modifie `display_name`.
- Évite de supprimer les comptes pour conserver l’association avec les séances. Préfère leur désactivation.

## Données et isolation

- **Tempo** lit et écrit seulement les dates du compte connecté, via l’identifiant contenu dans la session serveur. Un `user_id` envoyé par le navigateur est ignoré.
- **Entre deux rames** sauvegarde la dernière ligne et le dernier arrêt dans `hub_user_settings`, par compte. Le choix est restauré sur les autres appareils au prochain chargement de la page. Les anciennes préférences locales anonymes ne sont pas attribuées à un nouveau compte.
- Les données publiques PRIM (passages, perturbations, itinéraires) sont partagées ; les choix personnels ne le sont pas. La clé PRIM reste côté serveur dans `en-route-config.php`.
- Le hub affiche le nom du compte et propose la déconnexion sur chaque page. Les cartes de projet sont communes à tous les comptes.
- Session en cookie HTTP-only, SameSite=Lax, Secure en HTTPS ; identifiant renouvelé à la connexion, CSRF pour les écritures, expiration de la session courte après 12 h d’inactivité (et 7 jours maximum), puis restauration automatique par le cookie persistant tant que ses 30 jours ne sont pas écoulés.
- Limitation : 8 tentatives par identifiant/adresse IP et 40 par IP dans une fenêtre de 15 minutes. Les empreintes techniques expirées sont nettoyées ; les mots de passe et adresses IP brutes ne sont pas enregistrés dans cette table.

Les fichiers `hub-config.php`, `tempo-config.php`, `en-route-config.php`, les caches et les fichiers SQL sont ignorés par Git. `auth/schema.sql` est un schéma vierge local, distinct de ton import historique personnel. Les accès HTTP aux fichiers SQL et aux configurations sont refusés. Les outils `tools/password-hash.*` restent hors du dossier déployable.

## Références techniques

Le calcul hors ligne suit le profil PBKDF2-HMAC-SHA-256 à 600 000 itérations du [guide OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). La session suit les recommandations du [manuel PHP](https://www.php.net/manual/en/features.session.security.management.php).
