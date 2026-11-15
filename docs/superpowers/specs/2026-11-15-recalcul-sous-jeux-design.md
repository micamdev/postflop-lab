# Recalcul des sous-jeux à la demande (issue #12)

Date : 2026-11-15
Statut : en revue (vérification builder faite)

## Contexte et pourquoi

Une sauvegarde partielle (« jusqu'à la turn », « flop seul ») est bien plus
légère, mais aujourd'hui l'app s'arrête au nœud de chance non sauvegardé
(« Not saved »). L'utilisateur, qui étudie les textures de flop puis l'impact
des turns et des rivers, veut parcourir ses solutions comme si elles étaient
complètes.

GTO+, la référence du projet (« l'équivalent d'un GTO+ gratuit »), garde des
fichiers de quelques centaines de Ko en recalculant les données quand c'est
nécessaire, et sa fonction « Recalc Lines » recalcule les runouts turn/river
sans re-résoudre l'arbre ([gtoplus.com](https://www.gtoplus.com/)).

## Objectifs

- Quand l'utilisateur choisit une carte au-delà de la profondeur sauvegardée,
  l'app **re-résout automatiquement** ce sous-jeu (décidé avec l'utilisateur)
  et la navigation continue normalement : résultats, actions, rapports.
- Une **indication visible** que la street est recalculée à la demande
  (approximation proche de la solution complète).
- Un **cache en mémoire** : un sous-jeu déjà recalculé ne l'est pas deux fois
  tant que la solution est ouverte.
- Une fois en place : la profondeur par défaut du dialogue de sauvegarde passe
  de « complète » à « **jusqu'à la turn** ».
- **Lignes all-in** au-delà de la profondeur (tapis à 0 au nœud de chance :
  aucune décision restante, le moteur refuse un arbre sans tapis) : afficher le
  **showdown** (équité et EV par main, à partir des poids au nœud), sans
  résolution ni mention « recalculée ». *(Choix de Claude : c'est ce
  qu'afficherait une solution complète.)*

## Non-objectifs

- Un bouton « Recalculer plus précisément » ou des réglages visibles (plus
  tard si le besoin apparaît).
- **Les sous-jeux turn depuis une sauvegarde « flop seul »** : un sous-jeu turn
  contient toutes ses rivers (dizaines de secondes à minutes, centaines de Mo
  à plusieurs Go par carte sur la machine de l'utilisateur). Cette version
  recalcule **les rivers seulement** ; « flop seul » garde « Not saved » à la
  turn. *(Choix de Claude ; la profondeur par défaut « jusqu'à la turn »
  couvre l'étude des turns.)*
- Le mode « passer la carte » au-delà de la profondeur : il faut choisir une
  carte (le nœud de chance n'a pas de nœud joueur suivant tant qu'aucune
  carte n'est choisie). Changer de carte annule le recalcul en cours.
  *(Choix de Claude.)*
- Sauvegarder les sous-jeux recalculés dans le fichier.
- Re-résoudre à partir d'un nœud quelconque d'une solution complète
  (« solve from here » libre) : ici, seulement au-delà de la profondeur.
- Reproduire dans le sous-jeu les lignes ajoutées ou retirées à la main dans
  l'éditeur d'arbre pour les streets recalculées (les tailles de mise de la
  configuration s'appliquent) ; noté comme limite.

## Anti-objectifs

- Un sous-jeu construit avec de mauvaises ranges, un mauvais pot ou de
  mauvais tapis (résultats faux sans que rien ne le signale).
- Un plantage ou une app figée pendant le recalcul (cf. issue #14 : une
  panique dans une commande synchrone ferme l'app).
- Une régression pour les solutions complètes ou résolues dans la session.

## Approches considérées

- **A. Aiguillage côté Rust, transparent (retenue).** Rust garde la partie
  principale et un cache de sous-jeux ; chaque commande de navigation découpe
  l'historique : la partie jusqu'au nœud de chance non sauvegardé va à la
  partie principale, la carte et la suite vont au sous-jeu correspondant. Le
  front change peu : des cartes à nouveau sélectionnables, une indication.
- B. Bascule côté front (le front change de partie active en entrant dans un
  sous-jeu). Écartée : toute la logique de `ResultNav.vue`, la plus fragile de
  l'app, serait à reprendre.
- C. Greffer le sous-jeu recalculé dans la partie principale. Écartée : le
  moteur n'alloue pas ces données au chargement d'une sauvegarde partielle ;
  chirurgie lourde du moteur.

## Design

### Construction du sous-jeu

Au nœud de chance non sauvegardé (fin d'une street), pour la carte choisie :

- **Board** : board courant + carte choisie.
- **Ranges** : pour chaque joueur, ses mains (`private_cards`) pondérées par
  leurs poids au nœud (`weights` : poids initial × probabilité d'atteindre le
  nœud), via `Range::from_hands_weights`. Les mains bloquées par la carte
  disparaissent naturellement.
- **Pot / tapis** : pot = pot initial + 2 × mise totale engagée par chaque
  joueur au nœud (égales à un nœud de chance) ; tapis = tapis effectif − mise
  engagée.
- **Arbre** : même configuration que la solution (tailles turn/river,
  donks, rake et plafond, seuils d'all-in et de fusion), état initial = la
  street distribuée (`River`).
- **Résolution** : cible d'exploitabilité = 0,3 % du pot du sous-jeu, ou
  l'exploitabilité atteinte par la solution (métadonnées, convertie en % du
  pot racine) si elle est plus élevée ; plafond de 1000 itérations ;
  précision 32-bit si la mémoire le permet, sinon 16-bit. La cible de la
  résolution d'origine n'est pas sauvegardée.
- **Range vide** au nœud pour un joueur : résultats « vides », pas de
  résolution (le moteur refuse une range vide).

Isomorphies de couleurs : vérifié dans le code (`strategy()` défait l'échange
de couleurs avant d'appliquer les poids ; `weights(p)` reste aligné sur
`private_cards(p)` au nœud de chance). Le test de concordance le confirme.

### Aiguillage (côté Rust)

- Une **session** remplace la partie seule : partie principale + cache
  `(historique jusqu'au nœud de chance, carte) → sous-jeu`. Le cache est vidé
  quand la partie principale change (nouvel arbre, chargement).
- Les commandes de navigation (`game_apply_history`, `game_get_results`,
  `game_actions_after`, `game_total_bet_amount`, `game_possible_cards`,
  `game_get_chance_reports`, `game_private_cards`…) découpent l'historique et
  interrogent la bonne partie. Les indices de mains renvoyés au front doivent
  rester ceux de la partie principale : les mains du sous-jeu sont un
  sous-ensemble, dans le même ordre ; les tableaux par main (dont la stratégie
  actions × mains) sont complétés par des zéros aux mains absentes.
- `game_total_bet_amount` ajoute les mises engagées avant le nœud de chance
  (le front calcule le pot comme pot initial + mises).
- Mémoire : budget pour le cache (les sous-jeux river sont petits) ; si un
  sous-jeu ne tient pas même en 16-bit, message clair, pas de résolution.
- Pendant un recalcul, sauvegarde et chargement sont bloqués.
- Une commande **asynchrone** `game_resolve_subgame(history, card)` construit
  et résout le sous-jeu s'il n'est pas en cache, avec progression
  (itération / exploitabilité) et annulation possible.

### Front

- Au nœud de chance au-delà de la profondeur : les cartes redeviennent
  sélectionnables ; choisir une carte lance le recalcul (indicateur de
  progression dans la barre de navigation, interface verrouillée), puis la
  navigation reprend.
- La street recalculée porte une mention « recalculée (≈) ».
- Le rapport carte par carte d'un nœud de chance au-delà de la profondeur
  demanderait un sous-jeu par carte (44 à 46) : non affiché, avec une phrase
  qui l'explique.
- Dialogue de sauvegarde : profondeur par défaut « jusqu'à la turn ».

### Tests

- **Concordance** : sur une solution complète résolue, recalculer une river
  comme sous-jeu et comparer avec la vraie river : équité et EV par joueur à
  tolérance serrée, stratégie seulement en fréquences globales (les
  équilibres ne sont pas uniques).
- All-in : showdown au-delà de la profondeur = équité/EV de la solution
  complète à la même position.
- Ranges du sous-jeu : poids égaux aux poids au nœud × (mains compatibles).
- Pot et tapis du sous-jeu après une ligne mise/call.
- Aiguillage : historique découpé correctement, cache utilisé, cache vidé au
  changement de partie, aucune panique sur une partie vide.
- Vérification dans l'app : sauvegarde « jusqu'à la turn » rechargée, river
  choisie, navigation complète dans la river recalculée.

## Laissé au builder

- La structure exacte de la session Rust et la correspondance des indices
  de mains.
- La tolérance du test de concordance.
- Rejouer dans le sous-jeu les lignes ajoutées/retirées à la main qui
  traversent le nœud de chance (sauvegardées dans le fichier) si c'est simple ;
  sinon, la limite décrite en non-objectif s'applique.
- Le texte exact des indications.
