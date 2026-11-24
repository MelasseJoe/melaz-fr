# À tête reposée — Sommaire vert sauge

Le quatrième carnet du hub ouvre `projets/plateaux/`. L’écran **Mes listes** présente les listes personnelles et la vue **Toutes les tâches**. Dans chaque liste, les tâches à faire s’affichent de la priorité haute à la basse.

## Déployer sur OVH Starter

1. Dans phpMyAdmin, sélectionne la base existante du hub, qui contient `hub_users`.
2. Pour une première installation, importe d’abord `projets/plateaux/schema.sql` pour créer la table des tâches. Si le carnet est déjà installé, passe directement à l’étape suivante.
3. Si la base ne contient pas encore les listes, importe `projets/plateaux/migration-listes.sql` avant de transférer les fichiers. La migration ajoute la table des listes et un rattachement facultatif aux tâches. Les tâches sans liste apparaissent automatiquement dans **Rappels**, avec leur titre, leur priorité et leur état. Les tâches terminées se retrouvent dans **Terminées**. La migration peut être relancée si l’import s’interrompt.
4. Transfère les fichiers à jour de `hub-projet/projets/plateaux/` en gardant les deux fichiers SQL en local, puis ouvre le carnet avec un compte existant.

Le carnet utilise PHP 8.1 minimum et PDO MySQL/MariaDB. La configuration privée au-dessus de `www` et la connexion commune du hub sont réutilisées.

## Utilisation et sauvegarde

- **Nouvelle liste** crée une liste privée dans le sommaire. Une tâche ajoutée depuis une liste y est enregistrée. Depuis **Toutes les tâches**, tu peux choisir sa liste à la création.
- Pour renommer une liste, y compris la liste par défaut **Rappels**, touche le crayon à droite de son titre. Modifie le titre sur place et valide avec la coche ou Entrée. Touche en dehors du titre et de ses boutons pour abandonner la saisie.
- Les pictogrammes fusée, avion en papier et escargot indiquent les priorités haute, normale et basse. Ils figurent aussi dans le formulaire d’ajout. Touche le pictogramme d’une tâche pour modifier sa priorité ou la supprimer.
- Coche une tâche pour la retrouver dans **Terminées**. Décoche-la depuis cette section pour la remettre parmi les tâches à faire.
- Les listes et tâches sont sauvegardées en ligne et restent accessibles sur les autres appareils connectés au même compte. Elles ne sont pas mises en cache par la PWA.
- La sauvegarde vérifie la version des tâches pour éviter d’écraser une modification effectuée sur un autre appareil. Après une coupure, réessayer un ajout réutilise son identifiant.

Les polices Instrument Sans et Instrument Serif et les icônes Lucide Static sont servies depuis `assets`, avec leurs licences.
