# Tempo — installation sur OVH Starter

Avant une première mise en ligne, suis aussi `../../auth/LISEZ-MOI.md` et importe le schéma commun.

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
Un clic sur un jour sans sport ajoute la séance ; un clic sur un jour avec sport la retire. Ce comportement est identique dans la semaine en haut et sur le calendrier, sans fenêtre de saisie.

Les changements d’un autre appareil sont relus au retour sur la page et toutes les 30 secondes
lorsque l’onglet est visible. Une modification n’est affichée comme enregistrée qu’après confirmation
du serveur. Pendant la sauvegarde, les clics supplémentaires sont bloqués. En cas de perte de connexion, le jour garde son état précédent et un message indique l’erreur : réessaie après reconnexion.

## Données par compte connecté

- Le calendrier affiche le mois courant et les 12 mois précédents. Les jours futurs restent désactivés.
- Le sélecteur permet aussi de consulter les années précédentes. Le nombre de jours de sport
  affiché à côté du libellé compte uniquement les dates de la période sélectionnée, sans les pauses.
- La date du serveur, dans le fuseau `Europe/Paris`, détermine le jour courant.
- Le pouls compte les jours de sport sur les 28 derniers jours.
- Le fil relie les semaines civiles consécutives (lundi à dimanche) comportant au moins 3 jours de sport, quels que soient les jours choisis. Une semaine en cours ne rompt pas la série précédente avant sa fin. La meilleure série privilégie le nombre de semaines, puis les jours de sport en cas d’égalité.
- La durée totale couvre les semaines validées, du lundi au dimanche (jusqu’à aujourd’hui pour une semaine en cours déjà validée). Les repos de ces semaines sont légèrement teintés ; les journées futures ne le sont pas.
- Le record utilise tout l’historique, même les dates qui ne sont plus dans le calendrier.
- Les données sont associées à l’identifiant de la session du hub. Le compte propriétaire **id = 1** conserve les anciennes séances ; un nouveau compte commence sans séance.

La page et son API exigent désormais une connexion au hub. Le navigateur ne choisit jamais le compte auquel une séance appartient. Voir `../../auth/LISEZ-MOI.md` pour installer la connexion et créer les comptes.

Pour sauvegarder tes données, exporte régulièrement la table `tempo_sport_days` depuis phpMyAdmin.
Les fichiers du site et la base doivent être sauvegardés séparément.

## Si la page indique que la base est indisponible

Vérifie la version PHP, les paramètres du fichier de configuration et l’import de `schema.sql`.
Les détails des erreurs sont dans les logs PHP de l’hébergement OVH ; ils ne sont pas affichés aux visiteurs.
Un simple serveur statique Python ne peut pas exécuter l’API PHP.
