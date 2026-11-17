# À tête reposée — Vert sauge

Le quatrième carnet du hub ouvre `projets/plateaux/`. Il reprend la maquette validée : dossiers en cascade sur ordinateur, superposés et espacés de 46 px sur mobile, contrastes sauge, onglets clairs et couches de papier. Les titres des dossiers restent écrits. Les sélecteurs utilisent les pictogrammes fusée, avion en papier et escargot, sans flèche visible.
Le carnet du hub reprend la proposition **Fenêtre sur les priorités** : couverture sauge épaisse, fenêtre en creux avec trois dossiers superposés, titre en bas et pages visibles en perspective. Son ouverture conserve l’animation des carnets du hub.

## Déployer sur OVH Starter

1. Dans phpMyAdmin, sélectionne **la base existante du hub**, qui contient déjà `hub_users`.
2. Importe une seule fois le fichier local **`projets/plateaux/schema.sql`**. Il ajoute uniquement `todo_tasks`, sans modifier les tables et données des autres projets.
3. Transfère le contenu à jour de **`hub-projet`**, en conservant le fichier caché `.htaccess`. Il faut aussi mettre à jour `auth/lib.php`, qui protège le nouveau projet, et les fichiers du hub.
4. Ouvre **À tête reposée**, le quatrième carnet. Les comptes existants sont immédiatement utilisables et commencent avec une liste vide.

Aucun nouvel identifiant, aucune nouvelle clé et aucune compilation. PHP 8.1 minimum et PDO MySQL/MariaDB, comme le hub existant. La configuration privée située au-dessus de `www` reste réutilisée par `HubAuth\database()`.

Le SQL reste local, exclu de GitHub par les règles existantes. Il sert uniquement à l’import manuel et ne doit pas être déposé dans le répertoire public. Aucun import n’a été exécuté sur OVH.

## Utilisation et sauvegarde

- Saisis une tâche, choisis sa priorité en cliquant sur le pictogramme puis valide avec le bouton + ou Entrée. Le titre accepte jusqu’à 160 caractères.
- Coche une tâche pour la déplacer dans **Terminées**. Décoche-la pour la retrouver dans son dossier.
- Clique sur son pictogramme pour ouvrir le choix des trois priorités. Le même menu propose **Supprimer la tâche**, séparé des priorités. La suppression est sauvegardée sans proposer d’annulation. Le dossier, le pictogramme et les compteurs suivent la modification.
- Les actions sont enregistrées sans bouton d’annulation ni message de confirmation. Les erreurs de sauvegarde restent affichées.
- Les tâches sont relues à l’ouverture, au retour sur la page et lors d’un changement dans un autre onglet du même navigateur. Une connexion internet est nécessaire pour sauvegarder.

Toutes les requêtes utilisent la session connectée. L’identifiant utilisateur envoyé par un client est ignoré. Les écritures contrôlent le jeton CSRF, valident le contenu et vérifient la version de la tâche pour éviter qu’un appareil écrase une modification plus récente. Un nouvel essai d’ajout après une coupure réutilise le même identifiant. Les erreurs restent affichées et la saisie est conservée.

Les données des tâches ne sont stockées ni dans `localStorage` ni dans le cache de la PWA. Les changements s’affichent immédiatement, puis sont sauvegardés en arrière-plan sans rechargement de la page. Les lignes et pictogrammes inchangés restent en place, sans atténuation globale des contrôles. Les erreurs restent visibles et la liste est réconciliée avec le serveur si nécessaire. Les états de chargement utilisent un espace réservé, sans déplacer les dossiers pendant une sauvegarde.

## Ressources

Les polices Instrument Sans et Instrument Serif sont hébergées dans `assets`, avec leurs licences SIL Open Font License. Les sept icônes sont issues de Lucide Static 0.468.0, avec leur licence ISC, et sont aussi servies localement. Aucun service tiers n’est appelé pour afficher ou sauvegarder les tâches.
