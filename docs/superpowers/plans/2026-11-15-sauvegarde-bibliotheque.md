# Chantier 2 — Sauvegarde, chargement et bibliothèque : plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** sauvegarder une solution résolue dans une bibliothèque de fichiers `.plab`, la lister, la recharger à l'identique, et gérer les fichiers (renommer, supprimer, importer, exporter).

**Architecture :** le moteur fournit la lecture d'en-tête seule et un décodage borné ; un module Rust `library` de l'app gère les fichiers (pur Rust, testable sans Tauri) ; des commandes Tauri l'exposent ; le front ajoute un dialogue de sauvegarde (Run Solver) et une page Library. Les gardes de profondeur sont côté Rust.

**Tech Stack :** Rust (engine, app Tauri 2), bincode 2.0.1 + zstd, serde_json, Vue 3 + Pinia, `tempfile` (tests).

**Spec :** `docs/superpowers/specs/2026-11-15-sauvegarde-bibliotheque-design.md`

## Global Constraints

- Branche `feat/sauvegarde` (existe, avec le design), PR vers `dev`. Commits sans `Co-Authored-By`, messages conventionnels.
- Zéro warning : `cargo clippy --workspace --all-targets --all-features -- -D warnings` et `pnpm lint` (`--max-warnings 0`) doivent passer à chaque commit.
- Format de fichier : celui du moteur (`save_data_to_file` / `load_data_from_file`), compression zstd, extension `.plab`.
- Dossier : `<Documents>\Postflop Lab\Solutions`, créé au besoin. Nom affiché = nom de fichier sans extension.
- Écriture atomique : fichier temporaire dans le même dossier, puis renommage.
- Profondeur par défaut du dialogue : **complète**.
- Toutes les opérations de fichiers de la bibliothèque passent par des commandes Rust ; aucune permission `fs` ajoutée dans `capabilities/default.json`.
- Une partie résolue avec bunching ne se sauvegarde pas (message explicite).
- Comportement existant inchangé hors des nouvelles fonctions.

## Review Focus

1. **Navigation au-delà de la profondeur** d'une solution tronquée (chance node de turn sur une sauvegarde « flop seul », de river sur « jusqu'à la turn ») : pas de panique, l'UI l'indique. Couvert en Task 3 (tests des gardes).
2. **Fichier corrompu / tronqué / étranger / version inconnue** dans le dossier : la liste l'affiche « illisible » avec la raison, l'app ne plante pas, pas d'allocation géante. Couvert en Task 1 (limite de décodage) et Task 2 (tests de `list`).
3. **Interruption pendant l'écriture** : aucun fichier final partiel ; le temporaire est nettoyé ou ignoré par la liste. Couvert en Task 2.
4. **Chargement trop gros pour la RAM** : refus avec message (taille nécessaire vs disponible), partie courante intacte. Couvert en Task 3.
5. **Noms de fichiers** : caractères interdits (`\ / : * ? " < > |`), noms vides, collisions (sauvegarde, renommage, import) → assainis ou confirmation demandée, jamais d'écrasement silencieux. Couvert en Task 2.

---

### Task 1 : moteur — en-tête seul et décodage borné

**Files :**
- Modify : `engine/src/file.rs`, `engine/src/game/base.rs` (accesseur bunching), `engine/src/lib.rs` (exports si besoin)
- Test : `engine/src/file.rs` (module `tests`, feature `zstd` pour le cas compressé)

**Interfaces :**
- Produces :
  - `pub struct FileHeader { pub compression: bool, pub estimated_memory_usage: u64, pub memo: String }`
  - `pub fn load_header_from_file<T: FileData, P: AsRef<Path>>(path: P) -> Result<FileHeader, String>` — lit et valide magic, version, compression, type, mémoire, mémo ; ne lit pas les données.
  - `PostFlopGame::is_bunching_enabled(&self) -> bool` (`bunching_num_dead_cards > 0`).
  - Décodage : `bincode::config::standard().with_limit::<N>()` dans `decode_from_std_read`, avec `N = 1 << 20` (1 Mio) pour les champs d'en-tête et le mémo ; le corps de la partie reste borné par `max_memory_usage` (déjà vérifié) — ajouter une limite égale à `estimated_memory_usage` + marge si l'API bincode le permet, sinon documenter.

- [ ] **Step 1 : tests en échec** : `header_roundtrip` (sauvegarde d'une petite partie river résolue avec mémo `"{\"k\":1}"` → `load_header_from_file` renvoie le même mémo, `compression` correcte avec et sans zstd), `header_rejects_foreign_file` (fichier de 100 octets aléatoires → `Err`), `header_rejects_truncated` (fichier valide tronqué au milieu de l'en-tête → `Err`), `memo_length_is_bounded` (en-tête forgé annonçant un mémo de 4 Gio → `Err` sans allocation), `bunching_flag` (`is_bunching_enabled()` faux par défaut).
- [ ] **Step 2 :** `cargo test -p postflop-solver --release --features zstd file::` → FAIL (fonctions absentes).
- [ ] **Step 3 :** implémenter ; la lecture de l'en-tête réutilise le code de `load_data_from_std_read` (factoriser une fonction privée `read_header`).
- [ ] **Step 4 :** même commande → PASS ; puis `cargo test -p postflop-solver --release --features zstd` et l'exemple `file_io` → PASS.
- [ ] **Step 5 : Commit** `feat(engine): read save headers alone and bound decoding`

### Task 2 : module `library` de l'app (fichiers)

**Files :**
- Create : `desktop/src-tauri/src/library.rs`
- Modify : `desktop/src-tauri/Cargo.toml` (`postflop-solver` avec `features = ["zstd"]`, `[dev-dependencies] tempfile`), `desktop/src-tauri/src/main.rs` (`mod library;`)

**Interfaces :**
- Consumes : `load_header_from_file`, `save_data_to_file`, `load_data_from_file` (Task 1).
- Produces (fonctions pures, `dir: &Path` en paramètre pour les tests) :
  - `#[derive(Serialize, Deserialize, Clone)] pub struct SolutionMeta { schema: u32 /* = 1 */, app_version: String, created_at: String /* RFC 3339 */, board: Vec<u8>, ranges: [String; 2], tree_config: serde_json::Value, depth: String /* "river"|"turn"|"flop" */, exploitability: f32, iterations: u32, precision: String /* "32"|"16" */, summary: SolutionSummary }`
  - `#[derive(Serialize, Deserialize, Clone)] pub struct SolutionSummary { equity: [f64; 2], ev: [f64; 2], root_player: String, root_actions: Vec<String>, root_frequencies: Vec<f64> }`
  - `#[derive(Serialize)] pub struct LibraryEntry { name: String, file_size: u64, meta: Option<SolutionMeta>, error: Option<String> }`
  - `pub fn library_dir() -> PathBuf` (Documents via `dirs::document_dir()` ou l'API de chemins Tauri, + `Postflop Lab/Solutions`)
  - `pub fn sanitize_name(name: &str) -> Result<String, String>` (remplace `\ / : * ? " < > |` et caractères de contrôle par `_`, rogne espaces et points finaux, refuse vide et noms réservés Windows `CON`, `NUL`, `COM1`…)
  - `pub fn save(dir: &Path, name: &str, game: &PostFlopGame, meta: &SolutionMeta, overwrite: bool) -> Result<PathBuf, String>` — `Err("exists")` si le fichier existe et `!overwrite` ; écrit `<name>.plab.tmp` puis renomme.
  - `pub fn list(dir: &Path) -> Vec<LibraryEntry>` — ignore les `.tmp` ; fichier illisible → `error: Some(raison)` ; trié par `created_at` décroissant (illisibles en fin).
  - `pub fn load(dir: &Path, name: &str, max_memory: u64) -> Result<(PostFlopGame, SolutionMeta), String>`
  - `pub fn rename(dir: &Path, from: &str, to: &str) -> Result<(), String>`, `pub fn delete(dir: &Path, name: &str) -> Result<(), String>`, `pub fn import(dir: &Path, src: &Path, overwrite: bool) -> Result<String, String>` (valide l'en-tête avant de copier), `pub fn export(dir: &Path, name: &str, dest: &Path) -> Result<(), String>`.

- [ ] **Step 1 : tests en échec** (dans `library.rs`, avec `tempfile::tempdir()` et une petite partie river résolue en quelques itérations) : `save_then_list_then_load` (entrée listée avec `meta` égal à celui écrit ; partie rechargée : mêmes `private_cards`, même stratégie à la racine), `save_refuses_existing_without_overwrite`, `no_partial_file_on_failure` (sauvegarde vers un dossier en lecture seule ou nom invalide → pas de `.plab` final), `list_marks_unreadable_files` (fichier `bad.plab` aléatoire + `old.plab` de mémo non-JSON → deux entrées avec `error`, aucune panique), `list_ignores_tmp`, `sanitize_name_cases` (`"K/T:6?"` → `"K_T_6_"`, `"  "` → `Err`, `"CON"` → `Err`), `rename_and_delete`, `import_validates_header` (fichier étranger → `Err`, rien copié), `load_refuses_when_too_big` (`max_memory = 1` → `Err` contenant la taille nécessaire).
- [ ] **Step 2 :** `cargo test -p postflop-lab library::` → FAIL.
- [ ] **Step 3 :** implémenter. Le mémo est `serde_json::to_string(&meta)`.
- [ ] **Step 4 :** `cargo test -p postflop-lab library::` → PASS ; clippy `-D warnings` → PASS.
- [ ] **Step 5 : Commit** `feat: add the solution library module`

### Task 3 : commandes Tauri, résumé, gardes de profondeur

**Files :**
- Modify : `desktop/src-tauri/src/solver.rs` (gardes, résumé), `desktop/src-tauri/src/main.rs` (commandes enregistrées), éventuellement `desktop/src-tauri/src/library.rs`

**Interfaces :**
- Consumes : module `library` (Task 2).
- Produces (commandes Tauri, async pour les lourdes) :
  - `library_list() -> Vec<LibraryEntry>`
  - `library_save_estimate() -> Vec<(String, u64)>` — pour chaque profondeur possible (`"river"`, `"turn"`, `"flop"` selon l'état initial de l'arbre) : RAM nécessaire pour recharger (`set_target_storage_mode` + `target_memory_usage`, puis remise à `River`).
  - `library_save(name: String, depth: String, overwrite: bool, meta_front: serde_json::Value) -> Result<(), String>` — refuse si non résolu ou `is_bunching_enabled()` ; calcule `SolutionSummary` à la racine (équité, EV, fréquences des actions du joueur à la racine pondérées par `normalized_weights`) ; complète `SolutionMeta` avec `meta_front` (board, ranges texte, tree_config, itérations, exploitabilité, précision) ; remet la profondeur cible à `River` après écriture, succès ou échec. Progression : l'écriture passe par un `Write` qui compte les octets (via `save_data_into_std_write`) et émet l'événement Tauri `library-save-progress` (`{ written: u64, estimated: u64 }`) au plus toutes les 100 ms.
  - `library_load(name: String) -> Result<SolutionMeta, String>` — limite mémoire = mémoire disponible (`memory()`) + `memory_usage` de la partie courante (règle macOS : 70 % du total, comme `RunSolver.vue`) ; remplace la partie courante ; copie les ranges du `card_config` chargé dans le `RangeManager` ; renvoie les métadonnées.
  - `library_rename`, `library_delete`, `library_import(path, overwrite)`, `library_export(name, path)`, `library_open_folder()` (via `tauri_plugin_opener::OpenerExt::open_path` côté Rust).
  - Gardes : `game_apply_history`, `game_get_chance_reports`, `game_possible_cards` et `game_actions_after` ne jouent jamais une carte au-delà de `storage_mode()` ; `game_apply_history` renvoie `Result<(), String>` (`Err("beyond saved depth")`) au lieu de paniquer. Nouvelle commande `game_storage_mode() -> String`.

- [ ] **Step 1 : tests en échec** (fonctions internes testables sans Tauri, ex. `fn apply_history_checked(game: &mut PostFlopGame, history: &[usize]) -> Result<(), String>` et `fn compute_summary(game: &mut PostFlopGame) -> SolutionSummary`) : `apply_history_beyond_flop_save_is_err` (partie turn+river résolue, sauvegardée « flop » et rechargée ; historique jusqu'au chance node de turn puis une carte → `Err`, partie toujours utilisable), `summary_frequencies_sum_to_one` (somme des fréquences racine ≈ 1 à 1e-4 près ; équités dans [0, 1]).
- [ ] **Step 2 :** `cargo test -p postflop-lab` → FAIL.
- [ ] **Step 3 :** implémenter les fonctions et brancher les commandes (sans changer la signature des commandes existantes hormis le `Result` de `game_apply_history` ; adapter `invokes.ts` en conséquence).
- [ ] **Step 4 :** `cargo test -p postflop-lab` → PASS ; `cargo test --workspace --release` → PASS ; clippy `-D warnings` → PASS.
- [ ] **Step 5 : Commit** `feat: library commands, root summary and depth guards`

### Task 4 : front — dialogue de sauvegarde et page Library

**Files :**
- Modify : `desktop/src/invokes.ts` (fonctions `library*`, `gameStorageMode`), `desktop/src/store.ts` (vue `"library"`, statut « non sauvegardé »), `desktop/src/components/SideBar.vue` (entrée « Library »), `desktop/src/App.vue` (routage de la vue), `desktop/src/components/RunSolver.vue` (bouton « Save » une fois la résolution finie + dialogue), `desktop/src/components/ResultNav.vue` / `ResultChance.vue` (profondeur atteinte : cartes non sélectionnables + message « Not saved beyond the flop/turn »)
- Create : `desktop/src/components/LibraryPage.vue`, `desktop/src/components/SaveSolutionDialog.vue`

**Interfaces :**
- Consumes : commandes de Task 3.

- [ ] **Step 1 :** `SaveSolutionDialog.vue` : nom (défaut : cartes du board, ex. `Kh Td 6d`), choix de profondeur parmi celles renvoyées par `library_save_estimate` avec la RAM pour recharger et la taille de fichier approximative (« ~ » ; ordre de grandeur = RAM / 2 en 16-bit compressé, à mesurer en Step 5 et ajuster), texte de ce que chaque profondeur fait perdre (« Flop only: no turn card report, no navigation past the flop »), défaut « complete » ; écran d'attente avec barre de progression (événement `library-save-progress`) pendant l'écriture ; collision → confirmation puis `overwrite: true`. Bouton « Save » désactivé (avec raison) si bunching activé.
- [ ] **Step 2 :** `LibraryPage.vue` : tableau nom, board, date, profondeur, exploitabilité, précision, taille ; entrées illisibles en grisé avec la raison et seulement « Delete » ; actions Load, Rename, Delete (confirmation), Import (dialogue `open` filtre `.plab`), Export (dialogue `save`), Open folder. Après Load : restaurer `config`, `tmpConfig`, `savedConfig` et le board depuis `meta.tree_config`, relire les ranges depuis le Rust (`range_raw_data`/`range_get_weights` existants), reconstruire l'arbre d'actions (`tree_new` avec la config), marquer la résolution comme terminée avec itérations et exploitabilité du méta, bunching désactivé, puis ouvrir Results. Si une partie résolue non sauvegardée est en mémoire : confirmation avant de charger.
- [ ] **Step 3 :** gardes UI : lire `gameStorageMode()` après chargement ; au chance node au-delà de la profondeur, cartes désactivées et message ; `gameApplyHistory` en erreur → message, pas d'état cassé.
- [ ] **Step 4 :** `pnpm build && pnpm lint && pnpm exec vue-tsc --noEmit` → PASS.
- [ ] **Step 5 :** Vérification dans l'app (`pnpm tauri dev`) par l'implémenteur, sur un petit spot turn (résolution rapide) : sauvegarde complète, liste, rechargement après redémarrage de l'app, mêmes résultats ; sauvegarde « flop » rechargée → message au chance node de turn, pas de crash ; mesurer taille de fichier vs RAM affichée et corriger l'estimation « ~ » si l'écart dépasse un facteur 2.
- [ ] **Step 6 : Commit** `feat: save dialog and solution library page`

### Task 5 : vérification, PR

- [ ] **Step 1 :** suite complète : `cargo fmt --all --check`, clippy `-D warnings` all features, `cargo test --workspace --release`, engine `--features zstd` et `custom-alloc`, `pnpm build && pnpm lint && pnpm exec vue-tsc --noEmit` → tout PASS.
- [ ] **Step 2 :** bench de référence (b) une fois : médiane dans le bruit habituel (aucune modification du solveur attendue).
- [ ] **Step 3 :** push, PR vers `dev` (« feat: save, load and solution library (chantier 2) »), corps : résumé, points d'attention, « Closes #9 » à fermer manuellement, ligne « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ». `gh pr checks --watch` → vert.
- [ ] **Step 4 : test manuel utilisateur** : sauvegarder un vrai spot (complet puis « jusqu'à la turn »), fermer l'app, rouvrir, charger depuis Library, vérifier résultats et rapport des turns ; renommer, exporter, supprimer, réimporter ; déposer un fichier quelconque renommé en `.plab` dans le dossier → affiché « illisible ».
