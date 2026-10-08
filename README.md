# 🌸 Mon petit planner

Un planner tout doux pour organiser ses journées : to-do lists, planning, habitudes, journal, schémas et statistiques.

## Lancer l'application

**Double-clique sur `Lancer le planner.bat`** : le navigateur s'ouvre tout seul sur http://localhost:3000.
Garde la fenêtre noire ouverte pendant l'utilisation (la fermer arrête l'application).

Ou en ligne de commande :

```bash
npm install   # la première fois seulement
npm start
```

Il faut **Node.js 22.13 ou plus récent** (la base SQLite est intégrée à Node, aucune installation de base de données).

## Ce qu'il y a dedans

| Page | Ce qu'on peut faire |
|---|---|
| 🏡 **Ma journée** | Message selon l'heure, citation du jour, tâches du jour (+ ajout rapide), agenda du jour avec l'événement en cours, anneau de progression, habitudes à cocher, humeur, verres d'eau, minuteur Pomodoro avec son |
| 📝 **To-do lists** | Listes perso (emoji + couleur), listes intelligentes (Aujourd'hui, Cette semaine, Importantes, Toutes), priorités 🌸⭐🔥, échéances, notes, sous-tâches avec barre de progression, glisser-déposer pour réordonner, confettis 🎉 |
| 📅 **Planning** | Vue semaine (clic sur un créneau = nouvel événement, glisser pour déplacer, tirer le bas pour allonger, ligne de l'heure actuelle) et vue mois ; 7 catégories colorées |
| 🌱 **Habitudes** | Grille de la semaine, séries 🔥, trophées à 7/14/21/30 jours, historique sur 5 semaines |
| 📔 **Journal** | Humeur, eau, sommeil, 3 gratitudes, page lignée, enregistrement automatique |
| 🎨 **Schémas** | Cartes mentales, organigrammes, pour/contre : formes (cœur, nuage, post-it…), liens courbes ou droits, flèches, pointillés, textes sur les liens, zoom, annuler/rétablir, export en image PNG |
| 📊 **Statistiques** | Tâches terminées, avancement par liste, courbe d'humeur, régularité des habitudes, temps par activité, sommeil |
| ⚙️ **Réglages** | Prénom, 4 thèmes (Rose bonbon, Lavande, Pêche, Nuit étoilée), sauvegarde téléchargeable |

### Raccourcis dans l'éditeur de schémas
Double-clic : écrire · **Tab** : ajouter une idée reliée · **Entrée** : modifier le texte · **Suppr** : effacer ·
**Ctrl+Z / Ctrl+Y** : annuler / rétablir · **Ctrl+D** : dupliquer · **flèches** : déplacer · molette : zoom.

## Données

Tout est stocké en local dans `data/planner.db` (SQLite). Pour sauvegarder, copie ce fichier
ou utilise « Télécharger une sauvegarde » dans les Réglages. Supprimer le dossier `data` remet l'application à zéro
(avec quelques exemples).

## Technique

- Serveur : Node.js + Express, module `node:sqlite` intégré (`server.js`, `db.js`)
- Interface : HTML/CSS/JavaScript sans framework ni étape de build (`public/`)
- Graphiques : Chart.js, servi en local depuis `node_modules` (pas besoin d'internet sauf pour les polices)
