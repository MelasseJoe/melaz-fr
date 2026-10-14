# Tempo — installation sur OVH Starter

Tempo utilise PHP 8.1 minimum (8.3 recommandé), PDO MySQL et une base MySQL/MariaDB.
Il n’y a aucun outil de compilation à lancer sur OVH. Le premier carnet du hub ouvre `projets/tempo/`.

## 1. Créer ou choisir la base

Dans l’espace client OVH : **Web Cloud → Hébergements → ton hébergement → Bases de données**.
Crée la base si nécessaire et note son **serveur**, son **nom**, son **utilisateur** et son **mot de passe**.
Le serveur MySQL indiqué par OVH doit remplacer `localhost` dans la configuration.

Ouvre phpMyAdmin depuis cette base, puis utilise **Importer** pour importer `schema.sql`.
Cette opération crée seulement `tempo_sport_days`, sans effacer les autres tables d’une base existante.
La table est vide : aucun exemple de séance ne sera ajouté.

## 2. Configurer PHP et les identifiants

Dans les informations de l’hébergement OVH, utilise une version PHP au moins 8.1.
Garde le dossier public déjà associé à ton domaine dans l’onglet Multisite (souvent `www`).

Copie `config.example.php` et renomme la copie **`tempo-config.php`**.
Renseigne les quatre valeurs MySQL dans cette copie ; ne partage pas ce fichier et ne le pousse pas sur GitHub.

Disposition recommandée via FTP/SFTP :

```text
racine de l’hébergement/
├── tempo-config.php       ← tes vrais paramètres, hors du dossier public
└── www/
    ├── index.html
    ├── projets.js
    ├── assets/
    └── projets/
        └── tempo/
            ├── index.html
            ├── api.php
            ├── app.mjs
            ├── core.mjs
            ├── store.mjs
            ├── styles.css
            └── .htaccess
```

Si tu ne peux pas créer un fichier hors du dossier public, renomme la copie **`config.php`**
et mets-la dans `www/projets/tempo/`. Le `.htaccess` fourni en interdit l’accès HTTP.
Un autre emplacement peut être défini via la variable serveur `TEMPO_CONFIG`.

## 3. Envoyer et vérifier

Envoie le contenu de `hub-projet` dans le dossier public de ton domaine en conservant les `.htaccess`.
Ne supprime pas un `config.php` déjà renseigné lors des prochaines mises à jour.

Ouvre le premier carnet, ajoute une séance, puis recharge la page : elle doit rester cochée.
Ouvre ensuite la même adresse sur ton téléphone : la séance doit aussi apparaître.
Décocher une date retire cette séance de la base.

Les changements d’un autre appareil sont relus au retour sur la page et toutes les 30 secondes
lorsque l’onglet est visible. Une modification n’est affichée comme enregistrée qu’après confirmation
du serveur. En cas de perte de connexion, la saisie reste ouverte avec un message : réessaie après reconnexion.

## Données et futur login

- Le calendrier affiche le mois courant et les 12 mois précédents. Les jours futurs restent désactivés.
- Le sélecteur permet aussi de consulter les années précédentes. Le nombre de jours de sport
  affiché à côté du libellé compte uniquement les dates de la période sélectionnée, sans les pauses.
- La date du serveur, dans le fuseau `Europe/Paris`, détermine le jour courant.
- Le pouls compte les jours de sport sur les 28 derniers jours.
- Le fil tolère 1 ou 2 jours de pause ; 3 jours interrompent la série.
- La durée totale va de la première à la dernière séance incluses, pauses intermédiaires comprises.
- Le record utilise tout l’historique, même les dates qui ne sont plus dans le calendrier.
- Les données sont associées côté serveur à `user_id = 1`. Le futur login du hub remplacera
  uniquement `currentUserId()` dans `api.php` par l’identifiant de la session.

À ce stade, il n’y a pas d’authentification : toute personne ayant accès à cette page peut consulter
et modifier le même calendrier. La protection de session contre les écritures intersites ne remplace pas un login.

Pour sauvegarder tes données, exporte régulièrement la table `tempo_sport_days` depuis phpMyAdmin.
Les fichiers du site et la base doivent être sauvegardés séparément.

## Si la page indique que la base est indisponible

Vérifie la version PHP, les paramètres du fichier de configuration et l’import de `schema.sql`.
Les détails des erreurs sont dans les logs PHP de l’hébergement OVH ; ils ne sont pas affichés aux visiteurs.
Un simple serveur statique Python ne peut pas exécuter l’API PHP.
