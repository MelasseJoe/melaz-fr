# Galerie aérée — Mise en ligne

Le dossier contient un site statique prêt à servir. Aucun Node.js, PHP, base de données ou compilation n’est nécessaire sur le serveur.

## Transférer le site

1. Décompresse `galerie-aeree.zip`.
2. Envoie **le contenu** du dossier `galerie-aeree` dans le répertoire public de ton site (souvent `public_html`, `www` ou `htdocs`) avec ton outil SFTP/FTP habituel.
3. `index.html` doit se trouver directement dans ce répertoire. Conserve les fichiers et le dossier `assets` ensemble.
4. Ouvre l’adresse de ton site. Tu peux aussi installer le hub dans un sous-dossier : tous les chemins sont relatifs.

## Ajouter ou modifier les projets

Ouvre `projets.js` avec un éditeur de texte. Chaque entrée définit un carnet :

```js
{ title: 'Mon outil', description: 'Un petit outil pratique', icon: 'braces', url: './projets/mon-outil/' }
```

- `title` : nom sous le carnet.
- `description` : texte secondaire.
- `icon` : `sparkles`, `braces`, `orbit`, `plus`, `waves` ou `ellipsis`.
- `url` : `null` pour un emplacement à venir ; un chemin relatif (`./projets/mon-outil/`) ou une adresse HTTPS pour ouvrir un projet dans le même onglet.

Tu peux ajouter ou retirer des entrées : la grille se réorganise automatiquement. Respecte les virgules entre les entrées. Aucun numéro de dossier n’est à renseigner : il est calculé automatiquement.

## Personnaliser

- Les textes d’introduction sont dans `index.html`.
- La disposition et les couleurs sont dans `styles.css`.
- Les valeurs `BACKGROUND_OPACITY = 0.15` et `OPENING = 0.9` au début de `app.js` reprennent les réglages choisis.
- Les polices et les images sont dans `assets` : le site ne dépend d’aucun service externe.

## Tester localement

Ouvre `index.html` dans un navigateur pour une première vérification. Pour reproduire un serveur, depuis ce dossier :

```sh
python3 -m http.server 8000
```

Puis ouvre `http://localhost:8000`. Pour arrêter : Ctrl+C.

Le site suit le thème clair/sombre du système. Il adapte la grille aux petits écrans et respecte le réglage de réduction des animations. Les carnets sont accessibles au clavier ; les emplacements à venir s’ouvrent dans une fenêtre fermable avec Échap.
