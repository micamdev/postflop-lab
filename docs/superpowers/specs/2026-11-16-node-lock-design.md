# Node lock — première version (nœud affiché)

Date : 2026-11-16
Statut : en revue (vérification builder faite)

## Pourquoi

L'utilisateur étudie comment exploiter la population : « OOP check-raise 96s
80 % du temps au flop ; la population ne le fait pas. Si je verrouille 96s à
90 % fold / 10 % raise et que je re-résous, comment évolue mon c-bet IP ? »
C'est le node lock standard des solveurs (GTO Wizard, PioSolver, GTO+) :
verrouiller la stratégie d'un joueur à un nœud, main par main, puis
re-résoudre pour voir l'adversaire s'adapter.

## Ce que font les autres (vérifié le 2026-11-16)

- **Tous** permettent d'éditer la stratégie **main par main** à un nœud (et une
  fréquence globale répartie selon la perte d'EV), puis de re-résoudre.
- **Le nœud affiché** est l'unité de verrou dans leur interface ; « toutes les
  turns » n'existe que par script (PioSolver) ou via les « incentives »
  (GTO+). GTO Wizard résout une street à la fois.
- Sources : [aide GTO Wizard](https://help.gtowizard.com/how-to-use-nodelocking/),
  [PioSolver node locking](https://piosolver.com/docs/viewer/node_locking/),
  [GTO+ special options](https://www.gtoplus.com/special-menu/).

## Objectifs

- Depuis la vue Results, à un **nœud joueur** de la solution courante, ouvrir
  un **éditeur de verrou** : sélectionner des mains et fixer leurs fréquences
  par action (ex. raise / call / fold).
- Seules les mains modifiées sont verrouillées ; les autres restent libres et
  le solveur les ajuste (verrou partiel, natif dans le moteur).
- Une **liste des verrous** de la solution (nœud, mains, fréquences), avec
  suppression.
- **Re-résoudre avec les verrous** : l'app propose d'abord de sauvegarder la
  solution de référence dans la bibliothèque, puis reconstruit l'arbre depuis
  la config, pose les verrous et relance la résolution habituelle (Run
  Solver, mêmes réglages, même affichage de progression).
- Les verrous sont **sauvegardés** avec la solution (le moteur les écrit déjà
  dans le fichier) et **listés à nouveau** quand on la recharge, pour les
  revoir ou les modifier.

## Non-objectifs (issues)

- Verrou sur **toutes les turns** d'un coup : issue #20.
- Fréquence globale répartie selon la perte d'EV, vue avant/après type
  « Compare Nodes » : plus tard.
- Verrou dans une river recalculée à la demande ou au-delà de la profondeur
  d'une sauvegarde partielle (ces nœuds ne sont pas dans l'arbre principal).
- Verrou avec effet de bunching.

## Anti-objectifs

- Un verrou appliqué à d'autres mains que celles choisies (indices de mains).
  Exception assumée : voir « Turns symétriques » ci-dessous.
- Perdre la solution de référence sans l'avoir proposé à la sauvegarde.
- Une panique dans une commande (elle fermerait l'app, issue #14).

## Approches considérées

- **A. Éditeur dans la vue Results + re-résolution par le flux Run Solver
  (retenue).** On verrouille là où on lit la stratégie ; la résolution réutilise
  le flux existant (progression, Stop/Pause, finalisation).
- B. Page « Node lock » séparée, avec sa propre navigation dans l'arbre.
  Écartée : duplique la navigation des résultats, la partie la plus complexe
  de l'app.

## Design

### Données d'un verrou

Un verrou = `{ history: number[], player: "oop"|"ip", actions: string[],
hands: { [combo: string]: number[] } }` :

- `history` : la ligne jusqu'au nœud (indices d'actions et cartes, comme la
  navigation) ; nœud de la partie principale uniquement, cartes explicites
  (pas de turn « passée »).
- `actions` : les actions du nœud (pour vérifier, après reconstruction de
  l'arbre, que le nœud est le même ; sinon le verrou est signalé invalide).
- `hands` : par combo (ex. `"9s6s"`), la fréquence de chaque action (somme 1).
- Côté moteur : à la reconstruction, pour chaque verrou, aller au nœud et
  appeler `lock_current_strategy` avec un tableau `actions × mains` : les
  fréquences pour les mains listées, une valeur non positive pour les autres
  (non verrouillées).

### Éditeur (vue Results)

- Bouton **Lock** sur un nœud joueur (désactivé ailleurs, avec la raison).
- L'éditeur reprend la grille 13×13 du nœud (stratégie courante affichée) et
  la liste des combos : on sélectionne des classes (tous les combos de la
  classe présents au nœud) ou des combos précis, puis on saisit les
  fréquences par action (somme 100 %, la dernière action modifiée est
  ajustée), « Appliquer aux mains sélectionnées ». Les mains verrouillées sont
  marquées dans la grille.
- Liste des verrous de la solution, suppression ; « Re-résoudre avec les
  verrous ».

### Re-résolution

- Dialogue : « Sauvegarder la solution actuelle avant de re-résoudre ? »
  (ouvre le dialogue de sauvegarde ; « non » possible), seulement si la
  solution n'est pas déjà sauvegardée et peut l'être.
- Reconstruction **côté Rust depuis la config exacte de la solution** (celle que
  la partie garde : ranges, board, arbre, lignes ajoutées/retirées), pas depuis
  la config éditable du front : mêmes nœuds et mêmes indices d'actions, un
  verrou ne peut pas viser un nœud disparu. *(Choix de Claude : « re-résoudre
  cette solution avec des verrous » ; modifier ranges ou tailles reste le flux
  Build Tree habituel.)* Les verrous sont tous vérifiés **avant** de libérer la
  solution de référence ; le contrôle des actions reste un simple garde-fou.
- Précision de la solution (32/16-bit) ; threads et cibles d'arrêt des réglages
  actuels de Run Solver ; allocation ; pose des verrous ; résolution par la
  boucle de Run Solver ; finalisation.
- Verrouillage désactivé pendant une résolution (en cours ou en pause) et avec
  le bunching.
- Après re-résolution, la liste des verrous suit la nouvelle solution, reste
  modifiable et s'accumule d'une re-résolution à l'autre. L'interface
  distingue les verrous déjà dans la solution des modifications en attente. La nouvelle solution
  n'est pas sauvegardée automatiquement (bouton Save habituel).
- Mémoire : même contrôle que Build Tree (avertissement si la RAM manque).
- Une solution chargée depuis une sauvegarde partielle peut être verrouillée
  sur ses nœuds sauvegardés (flop, turn) ; la re-résolution reconstruit
  l'arbre complet.

### Turns symétriques

Le moteur fusionne les turns équivalentes par symétrie de couleurs (ex. sur
un board sans cœur ni carreau, K♥ et K♦ donnent le même spot) : elles
partagent un seul nœud. Un verrou posé sous K♥ vaut donc aussi pour K♦ (mains
aux couleurs échangées) — c'est le même spot stratégique. L'interface
affiche ce verrou sous les deux cartes et le traite comme un seul verrou
(modifier l'un modifie l'autre ; pas deux verrous contradictoires).
*(Choix de Claude ; désactiver la symétrie demanderait de modifier le moteur
et coûterait mémoire et temps de calcul.)*

### Sauvegarde et rechargement

- Le moteur écrit déjà les verrous dans le fichier. Les métadonnées gagnent la
  liste lisible des verrous (schéma de métadonnées v2), pour la réafficher au
  chargement. Fichiers v1 : aucun verrou listé.

## Tests

- Moteur / Rust : verrou partiel sur une main → après résolution, sa
  stratégie est exactement celle verrouillée, les autres mains varient ;
  verrou sur un nœud de turn après une carte isomorphe (turn « échangée ») →
  la bonne main est verrouillée ; verrou réduisant le check-raise d'OOP au
  flop → la fréquence de c-bet d'IP augmente (test de sens, sur un petit
  spot) ; verrou dont le nœud n'existe plus après reconstruction → erreur
  propre, pas de panique. Le test de sens verrouille une part significative de la
  range d'OOP (une seule main bougerait trop peu le c-bet pour un test fiable).
- App : vérification dans l'interface (éditeur, liste, re-résolution,
  sauvegarde puis rechargement des verrous).

## Laissé au builder

- La forme exacte de l'éditeur dans l'interface actuelle (la refonte de l'UI
  le reprendra).
- La façon de transmettre les verrous au moteur (commande dédiée appelée dans
  le flux de résolution).
