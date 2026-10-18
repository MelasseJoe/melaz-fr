# Hub projet — Mise en ligne

Le hub reste statique, sans compilation. Son premier carnet ouvre Tempo, le calendrier de sport ; le deuxième ouvre **En route.**, les prochains métros et itinéraires dans la palette Lin & café.
Tempo nécessite PHP 8.1 minimum et une base MySQL/MariaDB pour sauvegarder les saisies entre appareils.
Les étapes OVH Starter sont dans `projets/tempo/LISEZ-MOI.md`.
En route utilise PHP 8.1 et cURL, sans base de données. Pour ajouter ta clé PRIM, suis `projets/en-route/LISEZ-MOI.md` : le fichier privé `en-route-config.php` se place au-dessus de `www`.

## Transférer le site

Le dossier `hub-projet` est la version à maintenir et à déployer directement. Aucune archive ZIP n’est nécessaire.

1. Envoie **le contenu** du dossier `hub-projet` dans le répertoire public de ton site (souvent `public_html`, `www` ou `htdocs`) avec ton outil SFTP/FTP habituel.
2. `index.html` doit se trouver directement dans ce répertoire. Conserve les fichiers et le dossier `assets` ensemble.
3. Ouvre l’adresse de ton site. Tu peux aussi installer le hub dans un sous-dossier : tous les chemins sont relatifs.

## Ajouter ou modifier les projets

Ouvre `projets.js` avec un éditeur de texte. Chaque entrée définit un carnet :

```js
{ title: 'Mon outil', description: 'Un petit outil pratique', icon: 'braces', url: './projets/mon-outil/' }
```

- `title` : nom sous le carnet.
- `description` : texte secondaire.
- `icon` : `sparkles`, `braces`, `orbit`, `plus`, `waves`, `ellipsis`, `dumbbell` ou `ticket`.
- `url` : `null` pour un emplacement à venir ; un chemin relatif (`./projets/mon-outil/`) ou une adresse HTTPS pour ouvrir un projet dans le même onglet.
- `cover` : `'tempo'` applique la couverture graphite et menthe avec calendrier et haltère ; `'en-route'` applique les tons lin et café. Sans cette propriété, le carnet classique est conservé.

Tu peux ajouter ou retirer des entrées : la grille se réorganise automatiquement. Respecte les virgules entre les entrées. Aucun numéro de dossier n’est à renseigner : il est calculé automatiquement.

## Personnaliser

- Les textes d’introduction sont dans `index.html`.
- La disposition et les couleurs sont dans `styles.css`.
- Les valeurs `BACKGROUND_OPACITY = 0.15` et `OPENING = 0.9` au début de `app.js` reprennent les réglages choisis.
- Les polices et les images sont dans `assets` : le site ne dépend d’aucun service externe.

## Tester localement

Pour vérifier le hub seul, ouvre `index.html` dans un navigateur. Pour ses ressources statiques, depuis ce dossier :

```sh
python3 -m http.server 8000
```

Puis ouvre `http://localhost:8000`. Pour arrêter : Ctrl+C.

Ce serveur Python ne fait pas fonctionner la base de Tempo. Pour tester Tempo localement,
utilise PHP et MySQL, importe `projets/tempo/schema.sql`, configure `projets/tempo/config.php`,
puis lance `php -S localhost:8000 -t .` depuis ce dossier.

Le site suit le thème clair/sombre du système. Il adapte la grille aux petits écrans et respecte le réglage de réduction des animations. Les carnets sont accessibles au clavier ; les emplacements à venir s’ouvrent dans une fenêtre fermable avec Échap.
