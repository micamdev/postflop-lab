# Chantier 2 — Sauvegarde, chargement et bibliothèque de solutions

Date : 2026-11-15
Statut : validé

## Contexte et pourquoi

Postflop Lab doit devenir l'outil GTO personnel du mainteneur, à la manière de
GTO+ : il résout ses spots sur sa machine, les garde et les étudie. Son étude
actuelle porte sur les textures de flop pour le c-bet (fréquence de c-bet de
la range, courbes d'équité / d'EV, avantage de range et de nuts) ; viendront
ensuite l'impact de chaque turn, puis la river.

Aujourd'hui, une solution disparaît à la fermeture de l'app : il faut
re-résoudre (plusieurs minutes, parfois bien plus) pour la revoir. Ce chantier
permet de garder ses solutions et de les retrouver dans une bibliothèque. Il
sert aussi de fondation au chantier suivant (lots de flops et rapport
agrégé), qui lira cette même bibliothèque.

Fil conducteur, donné par l'utilisateur : le bon compromis entre simplicité,
fiabilité, performance et professionnalisme. Ambition : **l'équivalent d'un
GTO+ gratuit**, en suivant ses bonnes pratiques plutôt qu'en réinventant.

GTO+ annonce des sauvegardes de quelques centaines de Ko grâce au recalcul
des données à la demande, et une fonction « Recalc Lines » qui recalcule les
runouts turn/river sans re-résoudre l'arbre ([gtoplus.com](https://www.gtoplus.com/)).
Ce chantier pose la sauvegarde à profondeur choisie ; le recalcul à la
demande vient juste après (voir feuille de route).

## Feuille de route mise à jour (décidée avec l'utilisateur)

1. Chantier 2 (celui-ci) : sauvegarde, chargement, bibliothèque.
2. **Recalcul des sous-jeux à la demande** (à la « Recalc Lines » de GTO+) :
   en arrivant sur une partie non sauvegardée d'une solution tronquée (ou sur
   demande), l'app re-résout ce sous-jeu à partir des ranges, du pot et des
   tapis du nœud. Une fois en place, la profondeur par défaut de la
   sauvegarde passe de « complète » à « jusqu'à la turn » (voire « flop
   seul »), pour des fichiers légers comme dans GTO+.
3. **Chantier 3 (nouveau) : lots de flops et rapport agrégé** — résoudre un
   ensemble de flops avec des arbres simplifiés, puis afficher par flop la
   fréquence et les tailles de c-bet, les équités/EV et un indicateur
   d'avantage de nuts. Remplace l'usage actuel des rapports agrégés de
   GTO Wizard.
4. Node lock (sur toutes les turns).
5. Refonte de l'UI.

Une librairie de solutions pré-résolues à distribuer est écartée : trop de
calcul pour la machine de l'utilisateur et un sujet de distribution à part.

## Objectifs

- Sauvegarder une solution résolue dans la bibliothèque, avec un nom choisi
  par l'utilisateur.
- Choisir la **profondeur sauvegardée** : complète, jusqu'à la turn, ou flop
  seul, avec la taille estimée affichée avant d'enregistrer.
- Voir la bibliothèque : liste des solutions avec leurs informations clés.
- Charger une solution et retrouver exactement l'état d'après résolution :
  ranges, board, configuration de l'arbre, résultats navigables.
- Supprimer, renommer, importer un fichier, exporter un fichier, ouvrir le
  dossier de la bibliothèque.

## Non-objectifs

- Sauvegarder une résolution inachevée pour la reprendre plus tard.
- Lots de flops, rapport agrégé, index SQLite (chantier 3).
- Changer de format de sérialisation (issue #9, tranchée ci-dessous).
- Refonte visuelle (chantier 4) : intégration minimale dans l'UI actuelle.
- Choix du dossier de la bibliothèque par l'utilisateur (emplacement fixe
  pour l'instant).

## Anti-objectifs

- Un fichier corrompu ou étranger qui fait planter l'app ou vide la liste.
- Un fichier à moitié écrit si l'app ou la machine s'arrête pendant une
  sauvegarde.
- Un chargement qui sature la RAM sans prévenir (le cas vécu au chantier 1).
- Une navigation dans les résultats au-delà de la profondeur sauvegardée qui
  plante l'app.
- Une solution rechargée qui diffère de ce qui avait été résolu.

## Approches considérées

### Format des fichiers (issue #9)

- **A. Garder le format du moteur : bincode 2.0.1 + zstd (retenue).** Existe
  et est testé ; l'en-tête de fichier porte déjà un numéro de version, ce qui
  permettra de reconnaître et convertir les anciens fichiers si l'on change un
  jour. Les gros blocs de données (`storage1`, `storage2`, `storage_ip`,
  `storage_chance`, des `Vec<u8>`) sont déjà écrits d'un seul tenant : un autre
  format n'apporterait pas de gain de vitesse notable. Coût : un avertissement
  « non maintenu » dans les audits de dépendances.
- B. Format maintenu (postcard, bitcode…). Écartée : réécrire la sérialisation
  manuelle du moteur (`engine/src/game/serialization.rs`) pour aucun gain
  visible. Le « zéro copie » (rkyv, mmap), seul vrai gain possible, est
  incompatible avec les pointeurs bruts des nœuds.

### Retrouver les solutions

- **A. Un dossier, un fichier par solution, les informations dans l'en-tête
  du fichier (retenue).** Le champ « mémo » de l'en-tête est écrit avant les
  données : la liste se construit en lisant les en-têtes seulement. Rien ne
  peut se désynchroniser ; copier ou supprimer un fichier suffit.
- B. Dossier + fichier d'index séparé. Écartée : risque de divergence entre
  l'index et les fichiers.
- C. Base SQLite. Écartée pour ce chantier : les solutions (jusqu'à plusieurs
  Go) resteraient des fichiers, SQLite ne serait qu'un index (même risque que
  B), avec une dépendance C et des migrations. Notée pour le chantier 3 comme
  **cache reconstructible** des statistiques par flop.

## Design

### Fichiers

- Dossier : `Documents\Postflop Lab\Solutions` (via le répertoire
  « Documents » de l'OS), créé au besoin. Sur la machine de l'utilisateur,
  Documents est local (pas redirigé vers OneDrive). Si l'app est publiée, un
  Documents synchronisé enverrait des Go dans le cloud : à reconsidérer alors
  (choix du dossier, hors périmètre ici).
- Un fichier par solution, extension `.plab`, nom de fichier = nom donné par
  l'utilisateur (caractères interdits par l'OS remplacés). Renommer = renommer
  le fichier.
- Contenu : le format du moteur (`save_data_to_file`), compression zstd
  activée (feature `zstd` du moteur à activer côté app).
- Champ mémo de l'en-tête : un JSON de métadonnées versionné, contenant au
  minimum : version du schéma, version de l'app, date de création, board,
  ranges OOP et IP (texte), configuration de l'arbre telle que l'app la
  manipule (mêmes champs que l'export « configurations », lignes ajoutées et
  retirées comprises), profondeur sauvegardée, exploitabilité finale,
  nombre d'itérations, précision (32-bit ou 16-bit).
- **Résumé pour le chantier 3**, calculé à la sauvegarde depuis la racine
  (ce que `game_get_results` renvoie déjà) : équité et EV de chaque joueur,
  fréquences des actions à la racine (donc fréquence de c-bet par taille).
  Le mémo ne change qu'en réécrivant tout le fichier : sans ce résumé, le
  chantier 3 devrait recharger chaque solution en entier pour bâtir ses
  statistiques. *(Choix de Claude.)*
- Le nom affiché est le nom du fichier ; il n'est pas dupliqué dans le mémo.
- Écriture **atomique** : fichier temporaire dans le même dossier, puis
  renommage une fois l'écriture terminée et le fichier fermé.

### Sauvegarde

- Possible une fois la résolution terminée (finalisée). Bouton
  « Sauvegarder » dans l'écran Run Solver.
- Dialogue : nom (proposé par défaut à partir du board), profondeur
  (complète / jusqu'à la turn / flop seul, selon ce que l'arbre permet ;
  **« complète » par défaut** tant que le recalcul à la demande n'existe pas). Pour
  chaque profondeur : la RAM nécessaire pour recharger (`target_memory_usage`,
  exacte) et la taille de fichier (approximative). Le dialogue dit ce que
  chaque profondeur fait perdre : **« flop seul » perd le rapport carte par
  carte des turns** (il faut jouer la turn), utile pour l'étude des turns.
- Pendant l'écriture, la partie est verrouillée : écran d'attente avec
  progression (octets écrits / estimation). Après la sauvegarde, la profondeur
  cible du moteur revient à « complète ».
- Opération longue : asynchrone, indicateur d'activité, UI non bloquée.
- Si le nom existe déjà : demander confirmation avant d'écraser.

### Bibliothèque

- Nouvelle entrée « Library » dans la barre latérale.
- Liste : nom, board, date, profondeur, exploitabilité, précision, taille sur
  disque ; triée par date décroissante.
- Actions : Charger, Renommer, Supprimer (avec confirmation), Importer un
  fichier `.plab` (copie dans la bibliothèque), Exporter (copie vers un
  emplacement choisi), Ouvrir le dossier.
- Un fichier illisible (corrompu, autre format, version inconnue) apparaît
  dans la liste comme « illisible » avec la raison ; il peut être supprimé,
  mais ne bloque ni la liste ni l'app.
- Toutes les opérations de fichiers de la bibliothèque passent par des
  commandes Rust : aucune permission `fs` supplémentaire côté front.

### Chargement

- Avant de charger, vérifier la mémoire : mémoire disponible + mémoire de la
  partie courante (libérée avant le décodage) ; règle macOS existante (70 % de
  la RAM totale) conservée. Si la solution ne tient pas : message clair
  (taille nécessaire vs disponible), pas de chargement.
- Le décodage bincode reçoit une limite de taille, pour qu'une longueur
  corrompue dans un fichier ne provoque pas une allocation géante.
- Import : l'en-tête est vérifié avant la copie ; nom existant →
  confirmation avant d'écraser.
- Après chargement : l'état du front (ranges, board, configuration de
  l'arbre, statut « résolu ») est restauré depuis les métadonnées, et l'app
  ouvre les résultats.
- Si la solution est tronquée (flop seul, ou jusqu'à la turn), l'UI empêche
  de naviguer au-delà de la profondeur sauvegardée et l'indique. **Le garde
  est aussi côté Rust** (`game_apply_history`, `game_get_chance_reports`,
  cartes possibles) : le moteur panique en jouant une carte au-delà de
  `storage_mode`, ce qui empoisonnerait le `Mutex` de la partie.
- Restauration : ranges reprises du `card_config` de la partie (le texte du
  mémo sert à l'affichage) ; `RangeManager` et arbre d'actions côté Rust
  reconstruits ; états du front (`savedConfig`, `config`, `tmpConfig`, statut
  résolu, bunching désactivé, itérations et exploitabilité) restaurés.
- Une solution chargée remplace la partie courante ; si une partie résolue et
  non sauvegardée est en mémoire, demander confirmation.

### Effet de bunching

Le moteur ne sérialise pas les données de bunching (vérifié dans
`Encode for PostFlopGame`). La sauvegarde d'une partie résolue avec bunching
est donc refusée avec un message explicite ; le test se fait côté Rust
(nombre de cartes mortes de bunching > 0).

### Tests

- Moteur / commandes Rust : aller-retour sauvegarde → chargement pour chaque
  profondeur, résultats identiques sur les nœuds sauvegardés ; lecture des
  métadonnées sans charger les données ; fichier corrompu, tronqué, étranger
  ou de version inconnue → erreur propre ; écriture atomique (pas de fichier
  final si l'écriture échoue) ; refus de charger au-delà de la mémoire
  disponible.
- Vérification manuelle : sauvegarder, fermer l'app, rouvrir, charger,
  retrouver les mêmes résultats ; solution tronquée ; import / export.

## Laissé au builder

- Le détail du dialogue de sauvegarde et de la page bibliothèque, dans le
  style actuel de l'app.
- Le niveau de compression zstd (un niveau rapide par défaut, mesuré).
- La forme exacte du JSON de métadonnées, dans le respect de la liste
  ci-dessus et avec un numéro de version de schéma.
- La façon de restaurer l'état du front (réutiliser les structures et
  fonctions de configuration existantes de `store.ts` / `TreeConfig.vue`).
