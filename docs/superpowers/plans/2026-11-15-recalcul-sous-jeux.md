# Recalcul des sous-jeux à la demande (issue #12) : plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** sur une solution sauvegardée « jusqu'à la turn », choisir une river au-delà de la profondeur re-résout automatiquement ce sous-jeu et la navigation continue normalement.

**Architecture :** un module Rust `subgame` construit et résout le sous-jeu river à partir de la position de la partie principale ; un cache géré par Tauri garde les sous-jeux résolus ; les commandes de navigation découpent l'historique et interrogent la bonne partie (aiguillage transparent), en ramenant les tableaux par main aux indices de la partie principale. Le front rend les cartes river sélectionnables, déclenche le recalcul et l'affiche.

**Tech Stack :** Rust (moteur, app Tauri 2), Vue 3 + Pinia.

**Spec :** `docs/superpowers/specs/2026-11-15-recalcul-sous-jeux-design.md`

## Global Constraints

- Branche `feat/recalcul` (existe, avec le design), PR vers `dev`. Commits sans `Co-Authored-By`, messages conventionnels.
- Zéro warning : `cargo clippy --workspace --all-targets --all-features -- -D warnings` et `pnpm lint` à chaque commit.
- **Rivers seulement** : seuls les nœuds de chance river au-delà d'une profondeur `turn` sont recalculés. `flop` garde « Not saved » à la turn (issue #15).
- Résolution : cible = max(0,3 % du pot du sous-jeu, exploitabilité atteinte par la solution convertie en % du pot racine × pot du sous-jeu) ; 1000 itérations max ; 32-bit si la mémoire le permet, sinon 16-bit, sinon refus avec message.
- All-in au nœud (tapis restant 0) : showdown, sans résolution affichée, sans mention « recalculée ».
- Range vide au nœud pour un joueur : résultats vides, pas de résolution.
- Il faut choisir une carte au-delà de la profondeur (pas de « passer la carte ») ; changer de carte annule le recalcul en cours.
- Aucune commande synchrone ne doit pouvoir paniquer sur une partie vide ou absente : une panique ferme l'app (issue #14). Les commandes qui touchent aux sous-jeux renvoient `Result`.
- Ordre de verrouillage : partie principale, puis cache des sous-jeux.
- Dialogue de sauvegarde : défaut « jusqu'à la turn » ; textes du design pour « flop seul » et « jusqu'à la turn ».
- Solutions complètes et résolutions de la session : comportement inchangé.

## Review Focus

1. **Indices de mains** : les tableaux par main renvoyés au front doivent rester alignés sur `game_private_cards` de la partie principale (mains bloquées par la river = zéros). Couvert en Task 2 (`results_are_padded_to_main_hands`).
2. **Pot et mises affichés** dans la river recalculée : `game_total_bet_amount` inclut les mises d'avant le nœud de chance. Couvert en Task 2 (`bets_include_offset`).
3. **Cache périmé** après un nouvel arbre ou un chargement : jamais de sous-jeu d'une autre solution. Couvert en Task 2 (`cache_cleared_on_new_game`).
4. **Annulation et changement de carte** pendant un recalcul : pas de résultat d'une autre carte affiché, interface déverrouillée. Couvert en Task 3 (`cancelled_solve_is_not_cached`) et Task 4 (vérification dans l'app).
5. **Lignes all-in et ranges vides** au-delà de la profondeur : showdown exact, pas de panique. Couvert en Task 1 (`allin_showdown_matches_full_solution`, `empty_range_is_empty_result`).

---

### Task 1 : construction et résolution du sous-jeu (module pur)

**Files :**
- Create : `desktop/src-tauri/src/subgame.rs` (+ `mod subgame;` dans `main.rs`)

**Interfaces :**
- Produces :
  - `pub enum SubgameKind { Solve, Showdown, Empty }`
  - `pub struct Subgame { pub game: PostFlopGame, pub kind: SubgameKind, pub hand_map: [Vec<usize>; 2] /* index sous-jeu -> index partie principale */, pub bet_offset: i32 /* mise de chaque joueur avant le nœud */ }`
  - `pub fn build_subgame(main: &mut PostFlopGame, card: Card) -> Result<Subgame, String>` — `main` doit être sur un nœud de chance river où `!can_deal_card()` ; construit (non résolu) : board courant + `card` ; ranges via `Range::from_hands_weights(private_cards(p), weights(p))` ; pot = `starting_pot + 2 * total_bet_amount[0]` ; tapis = `effective_stack - total_bet_amount[0]` ; `TreeConfig` reprend tailles river, donk river, rake, plafond, seuils. Tapis 0 → `Showdown` : `effective_stack = 1`, aucune taille de mise, `add_allin_threshold = 0`, `force_allin_threshold = 0` (seul check-check possible, gains exacts). Une range vide → `Empty` (pas de partie construite : `PostFlopGame::new()`).
  - `pub fn solve_subgame(sub: &mut Subgame, target: f32, max_iterations: u32, compression: bool, cancel: &AtomicBool, progress: impl FnMut(u32, f32)) -> Result<(), String>` — alloue, résout jusqu'à `target` (exploitabilité en jetons) ou `max_iterations`, `finalize` ; `Err("cancelled")` si `cancel` passe à vrai (vérifié à chaque itération). `Showdown` : une itération suffit.
  - `pub fn subgame_target(sub_pot: i32, root_pot: i32, reached_exploitability: Option<f32>) -> f32` — règle de la Global Constraint.

- [ ] **Step 1 : tests en échec** (partie de test : flop `Td9d6h`, turn `Qc`, ranges `"AA,KK,QQ,AK"` / `"QQ-99,AQ,KQ"`, pot 60, tapis 300, tailles turn et river `50%`, résolue complète ~100 itérations) :
  - `ranges_are_node_weights` : à la river (historique check-check, `apply_history` jusqu'au nœud de chance), pour chaque main du sous-jeu, son poids dans la range vaut `weights(p)` de la main correspondante dans la partie principale.
  - `pot_and_stack_after_bet_call` : ligne turn bet 30 / call → pot du sous-jeu 120, tapis 270, `bet_offset` 30.
  - `river_matches_full_solution` : sur la solution complète, pour une river donnée, résoudre le sous-jeu (cible 0,1 % du pot) et comparer à la vraie river au premier nœud : équité moyenne et EV moyenne de chaque joueur à 1 % du pot près ; fréquences globales des actions à 0,05 près.
  - `allin_showdown_matches_full_solution` : ligne turn all-in / call, river donnée : `kind == Showdown`, équité et EV moyennes identiques (1e-3 près) à la partie complète au nœud terminal après cette river.
  - `empty_range_is_empty_result` : position où un joueur n'a plus de poids → `kind == Empty`, aucune panique.
  - `target_rule` : `subgame_target(120, 60, Some(0.3))` = max(0,003 × 120, 0,3/60 × 120).
  - `cancelled_solve_is_not_cached` est en Task 3.
- [ ] **Step 2 :** `cargo test -p postflop-lab subgame::` → FAIL (module absent).
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** même commande → PASS ; clippy `-D warnings` → PASS.
- [ ] **Step 5 : Commit** `feat: build and solve river subgames from a node`

### Task 2 : cache et aiguillage des commandes de navigation

**Files :**
- Create : `desktop/src-tauri/src/session.rs` (cache + aiguillage, fonctions pures testables)
- Modify : `desktop/src-tauri/src/solver.rs` (commandes de navigation), `desktop/src-tauri/src/main.rs` (état géré `Mutex<SubgameCache>`), `desktop/src-tauri/src/library_commands.rs` (vider le cache au chargement)

**Interfaces :**
- Consumes : `Subgame`, `SubgameKind` (Task 1).
- Produces :
  - `#[derive(Default)] pub struct SubgameCache { pub entries: HashMap<(Vec<usize>, usize), Subgame>, pub active: Option<(Vec<usize>, usize)> }` ; `pub fn clear(&mut self)`.
  - `pub fn split_history(main: &mut PostFlopGame, history: &[usize]) -> (Vec<usize>, Option<(usize, Vec<usize>)>)` — préfixe jouable dans la partie principale ; si l'historique traverse un nœud de chance river non distribuable : `(préfixe jusqu'au nœud, Some((carte, suite)))`.
  - `pub fn pad_per_hand(values: &[f64], hand_map: &[usize], main_len: usize) -> Vec<f64>` et `pub fn pad_strategy(values: &[f64], num_actions: usize, hand_map: &[usize], main_len: usize) -> Vec<f64>`.
  - Commandes adaptées (état `Mutex<SubgameCache>` en plus) : `game_apply_history` (positionne `active` ; `Err("not resolved")` si la carte n'est pas en cache), `game_get_results` (renvoie les résultats de la partie active, ramenés aux mains principales ; `Showdown` → actions vides / `current_player` « terminal » ; `Empty` → `is_empty` pour les deux joueurs), `game_actions_after`, `game_total_bet_amount` (+ `bet_offset`), `game_possible_cards`, `game_get_chance_reports` (`Err` au-delà de la profondeur). Les commandes concernées deviennent `Result<…, String>` si ce n'est pas déjà le cas.
  - Le cache est vidé dans `game_init` et `library_load`.

- [ ] **Step 1 : tests en échec** (`session.rs`, partie de test de Task 1 sauvegardée « turn » et rechargée via `library::save`/`load` comme dans `solver::tests`) : `split_history_cases` (historique dans la partie principale → `None` ; check-check + carte + check → préfixe [0,0], carte, suite [0]) ; `results_are_padded_to_main_hands` (longueur = mains principales ; zéros aux mains contenant la carte river) ; `bets_include_offset` (ligne bet/call puis river : mises du sous-jeu + 30) ; `cache_cleared_on_new_game` (après `clear`, `entries` vide et `active` None).
- [ ] **Step 2 :** `cargo test -p postflop-lab session::` → FAIL.
- [ ] **Step 3 :** implémenter, puis adapter les commandes en s'appuyant sur ces fonctions.
- [ ] **Step 4 :** `cargo test -p postflop-lab` et `cargo test --workspace --release` → PASS (les tests existants de `solver::tests` restent verts) ; clippy → PASS.
- [ ] **Step 5 : Commit** `feat: route navigation to cached subgames`

### Task 3 : commande de recalcul (asynchrone, progression, annulation)

**Files :**
- Modify : `desktop/src-tauri/src/session.rs` ou nouveau `desktop/src-tauri/src/subgame_commands.rs`, `desktop/src-tauri/src/main.rs`

**Interfaces :**
- Consumes : Tasks 1 et 2.
- Produces :
  - `game_resolve_subgame(history: Vec<usize>, card: usize, reached_exploitability: Option<f32>) -> Result<String /* "solve"|"showdown"|"empty" */, String>` — `#[tauri::command(async)]` ; ne fait rien si déjà en cache ; construit (verrous courts), vérifie la mémoire (32-bit, sinon 16-bit, sinon `Err` avec tailles en Go), résout **hors du verrou de la partie principale** avec un `AtomicBool` d'annulation partagé, puis insère dans le cache. Événement `subgame-progress` (`{ iteration, exploitability }`, au plus toutes les 100 ms).
  - `game_cancel_subgame()` — met l'`AtomicBool` à vrai.

- [ ] **Step 1 : test en échec** : `cancelled_solve_is_not_cached` (fonction interne `resolve_into_cache(main, cache, history, card, cancel)` avec `cancel` déjà à vrai → `Err("cancelled")`, cache vide).
- [ ] **Step 2 :** `cargo test -p postflop-lab` → FAIL.
- [ ] **Step 3 :** implémenter.
- [ ] **Step 4 :** `cargo test -p postflop-lab` → PASS ; clippy → PASS.
- [ ] **Step 5 : Commit** `feat: async subgame re-solve with progress and cancel`

### Task 4 : front

**Files :**
- Modify : `desktop/src/invokes.ts` (`gameResolveSubgame`, `gameCancelSubgame`), `desktop/src/components/ResultNav.vue`, `desktop/src/components/ResultViewer.vue` (si l'affichage « Not saved » / recalculé y passe), `desktop/src/components/SaveSolutionDialog.vue`, `desktop/src/library.ts` (`depthLoss`), `desktop/src/store.ts` (indicateur de recalcul en cours si besoin)

- [ ] **Step 1 :** `ResultNav.vue` — au nœud de chance river au-delà d'une profondeur `turn` : cartes possibles sélectionnables (via `gamePossibleCards` de la partie principale), sans nœud joueur suivant tant qu'aucune carte n'est choisie ; choisir une carte → `gameResolveSubgame` (indicateur « Recalcul de la river… itération N » dans la barre, interface verrouillée), puis navigation normale (`selectSpot`). Changer de carte pendant un recalcul → `gameCancelSubgame` puis nouveau recalcul. Erreur (mémoire, annulation) → message dans la barre, verrou relâché. Pendant un recalcul, `store.isLibraryBusy` est vrai : Build Tree, Run Solver, Save et les actions de la bibliothèque sont bloqués (ajouter `store.isLibraryBusy` aux conditions du bouton Save de `RunSolver.vue`). `flop` et nœuds turn : inchangés (« Not saved »).
- [ ] **Step 2 :** mention « recalculée (≈) » sur le nœud river recalculé ; pas de mention pour `showdown` ; pour `empty`, résultats vides comme ailleurs. Rapport carte par carte au nœud river au-delà de la profondeur : non demandé, phrase « Not available: each river would need its own re-solve ».
- [ ] **Step 3 :** `SaveSolutionDialog.vue` : défaut `"turn"` s'il est proposé ; `depthLoss` : turn → « Rivers are re-solved on demand when you pick them. » ; flop → « Cannot go past the flop. Best for flop reports. ».
- [ ] **Step 4 :** `pnpm build && pnpm lint && pnpm exec vue-tsc --noEmit` → PASS.
- [ ] **Step 5 : vérification dans l'app** (session de dev avec débogage WebView2 et dossier de données temporaire, comme au chantier 2) : spot flop sauvegardé « jusqu'à la turn », rechargé ; turn choisie, check-check, river choisie → recalcul puis actions river navigables, mention « recalculée » ; autre river → nouveau recalcul ; retour sur la première → instantané (cache) ; ligne all-in → showdown sans recalcul affiché ; changement de carte pendant un recalcul → pas de résultat mélangé.
- [ ] **Step 6 : Commit** `feat: re-solve rivers on demand in the results`

### Task 5 : vérification, PR

- [ ] **Step 1 :** suite complète (fmt, clippy `-D warnings` all features, `cargo test --workspace --release`, moteur `zstd` et `custom-alloc`, `pnpm build`, lint, vue-tsc) → PASS ; bench de référence une fois, dans le bruit.
- [ ] **Step 2 :** push, PR vers `dev` (« feat: re-solve rivers on demand (#12) »), corps avec résumé, choix, limites (rivers seulement, #15), ligne « 🤖 Generated with [Claude Code](https://claude.com/claude-code) » ; `gh pr checks --watch` → vert.
- [ ] **Step 3 : relecture indépendante de la branche**, une passe de corrections.
- [ ] **Step 4 : test manuel utilisateur** : étude d'un spot flop sauvegardé « jusqu'à la turn » en parcourant plusieurs rivers ; comparer une river recalculée avec la même river d'une sauvegarde complète du même spot.
