# Refonte de l'interface

Date : 2026-11-16
Statut : à valider par l'utilisateur

## Pourquoi

L'utilisateur trouve que l'app « fait trop cheap » : grosse barre bleue qui
répète le nom et la version, lien GitHub trop visible, sélection du flop au même
niveau que « About » et « Bunching Effect », plein de gros boutons de couleurs
différentes sans logique de groupe. Le but du projet est un équivalent gratuit de
GTO+ « propre et pro ». Toutes les fonctions de base existent désormais (solve,
sauvegarde, bibliothèque, re-résolution de rivers, Compare, node lock) : on sait
ce que l'interface doit porter, c'est le moment de la refaire avant d'ajouter le
rapport flop (#19), qui sera ainsi dessiné une seule fois.

Inspirations citées par l'utilisateur : GTO Wizard, GTO+, Lucid Poker et les
autres solveurs.

## Audit de départ (captures du 2026-11-16)

1. **Parcours éclaté** : préparer un spot passe par 5 pages d'une barre latérale
   (OOP Range, IP Range, Board, Tree Configuration, Run Solver) sans jamais voir
   le spot en entier ; le bouton principal (lancer) est en bas d'une liste ;
   aucun état permanent (solution ouverte, sauvegardée ou non, calcul en cours).
2. **Results gaspille la place** : cartes de navigation de 200 px de haut pour
   2 lignes ; pas de barre de stratégie globale du nœud ; réglages en menus
   déroulants dispersés.
3. **Apparence incohérente** : grille sombre sur page blanche, boutons bleu /
   vert / rouge pâle sans logique, couleurs d'action sans convention.
4. **Manques du quotidien** : grandes zones vides (liste « No saved ranges »),
   messages techniques (« Status: Module not loaded »), la bibliothèque n'est
   qu'une rubrique parmi d'autres.

## Objectifs

- Une app **plus pro, plus belle et plus pratique**, sans perte de fonction.
- **Thème unique « Graphite »** (sombre neutre, accent turquoise) — choisi par
  l'utilisateur parmi trois directions (Nuit, Graphite, Clair pro).
- **Trois espaces** dans une barre du haut fine : **Setup**, **Results**,
  **Library**.
- **Setup en une seule page, sans fenêtre modale**, avec un explorateur de
  ranges et de configs d'arbre intégré.
- **Un seul bouton Solve** (l'arbre se construit automatiquement).
- **Results** compact : rectangles d'actions gardés, barre de stratégie du nœud,
  grille plus grande, réglages regroupés.
- **Compare** refait en composants compacts (disposition B).
- **Une seule action principale colorée par écran**, les autres boutons
  discrets et groupés.

## Non-objectifs

- Pas de changement du moteur ni des commandes Rust, sauf si un écran l'exige
  (ex. une estimation mémoire sans construire l'arbre — voir « Reste au
  constructeur »).
- Pas de « spots » (sauvegarde combinant ranges + arbre) pour l'instant :
  décidé avec l'utilisateur, on garde son modèle actuel (ranges et configs
  d'arbre sauvegardées séparément). Ajout possible plus tard.
- Pas de thème clair ni de choix de thème.
- L'app reste en anglais.
- Pas de rapport flop (#19), de verrou toutes turns (#20) ni de re-résolution
  turn (#15) dans ce chantier : ils viendront dans le nouveau cadre.

## Anti-objectifs (ce qui serait un échec même si ça marche)

- Un look générique de bibliothèque de composants (Bootstrap / Material) :
  l'apparence doit rester la nôtre.
- Perdre une fonction existante ou un raccourci de travail en route (ex. la
  navigation par cartes de turn/river, le river picker, l'export CSV, la
  re-résolution de rivers, les verrous).
- Une app inutilisable entre deux PR.
- Réécrire de zéro : on fait évoluer les composants existants (crédits
  b-inary conservés).

## Approches envisagées

1. **Tout fait maison** — variables de style + petit jeu de composants écrits à
   la main, aucune dépendance. Écartée : menus, arborescence, info-bulles et
   popovers sont là où les apps maison « font cheap » (clavier, focus,
   positionnement, fermeture au clic extérieur).
2. **Maison + Reka UI pour les pièces interactives** — *choisie par
   l'utilisateur.* Apparence 100 % à nous (Tailwind + variables), comportement
   des menus / sélecteurs / arborescence / popovers / info-bulles délégué à
   Reka UI (bibliothèque Vue « sans style », approche shadcn).
3. **Bibliothèque à thème (PrimeVue, Vuetify)** — écartée : look générique qui
   se bat contre Graphite, lourde.

Changer de framework est hors sujet (on garde Vue 3 + Tailwind 3.4 + Pinia).

## Décisions de conception

### Style « Graphite »

Variables CSS exposées dans le thème Tailwind (valeurs des maquettes) :

| Rôle | Valeur |
|---|---|
| Fond | `#151517` |
| Panneau | `#1d1d20` |
| Panneau 2 (champs, segments) | `#242428` |
| Bordure | `#323238` |
| Texte | `#ececee` |
| Texte secondaire | `#9a9aa3` |
| Accent (action principale, sélection) | `#2fb5a1` |
| Case vide (grille) | `#26262a` |
| Joueur OOP | `#5b8def` |
| Joueur IP | `#e0a03c` |

- **Couleurs d'action** (convention des solveurs) : check / call en vert, bets
  et raises en rouges de plus en plus foncés selon la taille, all-in le plus
  foncé, fold en bleu. Les couleurs OOP/IP (bleu / orange) servent à identifier
  les joueurs (Setup, Compare), jamais une action.
- Police système (Inter si présente), chiffres tabulaires pour les colonnes de
  nombres.
- Cartes du board : fond coloré par couleur de carte (cœur rouge, carreau bleu,
  trèfle vert, pique gris), comme dans les maquettes.

### Cadre de l'app

- **Barre du haut fine (≈ 40 px)**, de gauche à droite : board et nom de la
  solution courante, pastille d'état (*Not solved*, *Solving…*, *Not saved*,
  *Saved*), sélecteur segmenté **Setup | Results | Library**, puis à droite
  **⚙ Solve settings**, **?** (About) et l'action principale (**▶ Solve**, ou
  progression pendant le calcul). Plus de nom d'app ni de version dans la
  barre (ils vont dans About), plus de lien GitHub visible (dans About).
- **Library s'ouvre au démarrage.**
- **Pendant un calcul**, on reste où on est : la barre du haut montre une barre
  de progression, l'exploitabilité, le temps écoulé, **pause** et **stop**. À la
  fin, Results s'ouvre. Le solve verrouillé suit le même chemin (plus de détour
  par une page Run Solver) et garde le retour au nœud verrouillé.

### Setup (une page)

Maquette : `ui-redesign/setup.html`. Trois zones :

- **Gauche — explorateur** (≈ 250 px, toujours visible) : onglets **Ranges** et
  **Trees** ; recherche ; arborescence dépliable des dossiers (jusqu'à 4
  niveaux, comme aujourd'hui) ; un clic sur une range l'affiche et propose
  **→ OOP** / **→ IP** (glisser-déposer sur une grille aussi) ; un clic sur une
  config d'arbre la charge. Étiquettes OOP / IP sur les éléments utilisés. En
  bas : **＋ Folder**, **Save current…** ; renommer / supprimer / import /
  export JSON passent par un menu contextuel. Les données restent celles
  d'aujourd'hui (IndexedDB, tables `ranges` et `configurations`, groupes
  `name0..name3`).
- **Centre — les deux ranges en grand**, côte à côte, avec le chemin d'origine
  (ex. « 100bb › SRP › BB vs BTN call ») et le nombre de combos. **Edit** rend
  la grille éditable sur place (peindre les cases, saisie texte, poids, Clear,
  Save) ; **Done** referme. Aucune modale.
- **Droite** : **Board** (cartes cliquables, flop aléatoire), **Stacks** (pot,
  stack, SPR calculé), **Bet sizes** (tableau joueur × street en puces) avec
  **Edit tree ›** qui déplie sur place le reste de la config d'arbre (donk
  bets, rake, seuils all-in / merging, lignes ajoutées / retirées, éditeur
  d'arbre actuel), et une ligne mémoire estimée · threads · précision.
- **Un seul bouton Solve** : construit l'arbre puis lance. L'estimation mémoire
  est affichée en direct ; si elle dépasse ce que la machine peut tenir, Solve
  avertit (comme aujourd'hui) au lieu de lancer.

### ⚙ Solve settings (panneau)

Ce qui change rarement : **threads**, **précision** (32 / 16 bits),
**exploitabilité cible**, **itérations max**, et en section avancée le
**bunching effect** (avec la mention qu'il désactive le node lock). Ces réglages
sont **mémorisés** entre deux lancements. Panneau latéral qui glisse par-dessus
le bord droit, pas une modale bloquante.

### Results

Maquette : `ui-redesign/direction.html` (direction B).

- **Bande de nœuds** : les rectangles actuels (FLOP, OOP, IP, TURN…) gardés
  (demande explicite de l'utilisateur, « GTO Wizard a ça aussi »), en plus
  compacts : nom du joueur, actions avec pastille de couleur et pourcentage,
  action choisie surlignée, nœud courant encadré par l'accent. Cartes de
  turn/river et river picker conservés.
- **Barre d'outils du nœud** : onglets **Strategy | Equity | Compare** (Graphs
  devient Equity ; Basics devient Strategy), plus l'onglet **Turn / River**
  (rapport par carte) qui apparaît comme aujourd'hui quand un nœud de carte est
  sélectionné, puis à droite les réglages en petits sélecteurs
  segmentés (joueur, suits, display…) et **🔒 Lock node** avec un badge du
  nombre de verrous.
- **Barre de stratégie du nœud** pleine largeur (ex. Check 34.3 % | Bet 7
  65.7 %).
- **Grille** plus grande et dense ; panneau de droite pour la main survolée /
  sélectionnée et le résumé de range (tableau actuel restylé, export CSV
  gardé).
- **Compare — disposition B** (choisie par l'utilisateur ; maquette
  `ui-redesign/compare.html`) : les deux grilles d'équité à gauche (intensité =
  équité), une colonne étroite à droite avec les lignes OOP | libellé | IP
  (combos, équité, EV, EQR, nut advantage ★) puis la distribution d'équité en
  barres face à face.
- **Éditeur de verrou** : reste à la place de la grille, restylé.

### Library

Tableau actuel restylé, avec recherche et tri par colonne. Clic sur une ligne =
ouvrir ; menu **⋯** pour Rename / Export / Delete (et plus tard Report, #19).
Import et Open folder en boutons discrets.

### Règles transverses

- Une seule action principale colorée (accent) par écran ; les autres actions en
  boutons discrets (contour), groupées par usage.
- Messages pour humains (pas de « Module not loaded »).
- États vides utiles (ex. explorateur vide : « No saved ranges yet — Save
  current… »).

## Découpage (une PR par étape vers `dev`, app utilisable à chaque étape)

1. **Fondations** : variables Graphite + thème Tailwind, Reka UI, composants de
   base (bouton, segmenté, panneau, menu, info-bulle, champ), barre du haut et
   navigation Setup / Results / Library, panneau Solve settings, progression du
   calcul dans la barre. Les pages existantes tournent dans ce cadre (restylées
   au minimum pour ne pas jurer).
2. **Setup** : la page unique (explorateur, ranges en grand éditables sur
   place, board, stacks, mises, Edit tree), bouton Solve unique.
3. **Results** : bande de nœuds, barre d'outils, barre de stratégie, Strategy,
   Equity, Compare B, éditeur de verrou.
4. **Library et finitions** : Library, About, états vides, revue des messages.

## Reste au constructeur

- Le détail des composants et de leur API, l'organisation des fichiers.
- Comment estimer la mémoire en direct sans construire l'arbre à chaque frappe
  (construction en tâche de fond avec délai, ou estimation côté Rust) ; si une
  commande Rust est nécessaire, elle reste minimale.
- Où mémoriser les Solve settings (localStorage ou config existante).
- Les tailles exactes, espacements et états de survol, dans l'esprit des
  maquettes.

## Choix faits après relecture (à vérifier par l'utilisateur)

Points soulevés par la relecture « constructeur », tranchés par Claude :

1. **Save** : après un solve, l'action principale de la barre du haut devient
   **Save** (accent) et Solve passe en bouton discret ; une fois sauvegardée,
   Solve redevient l'action principale. Le choix de profondeur de sauvegarde
   (complète / turn / flop) reste une petite fenêtre de confirmation : c'est un
   choix ponctuel, pas un écran de travail.
2. **Re-solve avec verrous** : quand des verrous sont en attente sur la
   solution affichée, l'action principale devient **Re-solve with locks** (le
   bouton de l'éditeur reste aussi). Toute modification dans Setup (ranges,
   board, arbre) rend la solution périmée : Solve lance alors un solve neuf, qui
   abandonne les verrous, après confirmation s'il y en a.
3. **Onglets de Results** : Strategy | Equity | Compare, plus l'onglet de
   rapport par carte (Turn / River) qui apparaît comme aujourd'hui. Pas
   d'onglet « Ranges » (erreur de la maquette).
4. **Bunching** : le panneau Solve settings ne garde qu'un résumé (activé ou
   non) et un lien **Bunching effect…** qui ouvre la page actuelle (4 ranges de
   fold, pré-calcul) dans la zone centrale du Setup, restylée. Les ranges de
   fold ne sont pas mémorisées entre deux lancements (comme aujourd'hui) ; seuls
   threads, précision, exploitabilité cible et itérations max le sont.
5. **Compare** : les grilles gardent toutes leurs options actuelles (display
   Strategy / EV / EQR / équité, bar height, suits), regroupées en sélecteurs
   segmentés ; rien n'est perdu. La maquette montre l'affichage équité.
6. **Taille de fenêtre** : largeur minimale portée à 1280 px (aujourd'hui
   1080) ; en dessous de ≈ 1500 px, l'explorateur du Setup se replie en une
   colonne d'icônes qu'on déplie au clic. Fenêtre par défaut agrandie (≈ 1600 ×
   950, ou maximisée si l'écran est plus petit).
7. **Estimation mémoire** : une commande Rust dédiée calcule l'estimation sans
   remplacer la solution chargée (construire l'arbre en tâche de fond écraserait
   la partie en mémoire).
