# Chantier 0 — Fondations : plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** monorepo buildable sur Rust stable épinglé, allocateur choisi sur mesure, CI sur chaque PR, app renommée « Postflop Lab » — sans changer le comportement de l'app.

**Architecture :** workspace Cargo à la racine (`engine`, `desktop/src-tauri`), un seul `Cargo.lock` et un seul `target/`. L'app dépend du moteur par chemin. Un bench reproductible (`engine/benches/`) départage les options d'allocateur ; l'option retenue est appliquée côté app.

**Tech Stack :** Rust stable (rustup), Cargo workspace, Tauri 1.5, Vue 3 + Vite 4, GitHub Actions, `allocator-api2`, `mimalloc`.

**Spec :** `docs/superpowers/specs/2026-11-15-fondations-monorepo-design.md`

## Global Constraints

- Branche de travail : `chore/fondations`, créée depuis `dev`, PR vers `dev`.
- Commits sans ligne `Co-Authored-By` (consigne utilisateur, prime sur tout le reste).
- Messages de commit au format conventionnel (`build:`, `ci:`, `chore:`, `perf:`, `docs:`, `style:`).
- Aucun changement de comportement ou d'UI de l'app ; pas de montée Tauri 2 ni des dépendances front.
- Pas de refacto moteur au-delà de ce qu'exige le build ou le port `allocator-api2`.
- Licence AGPL-3.0-or-later inchangée ; `desktop/LICENSE`, `engine/LICENSE` et les copyrights de Wataru Inariba conservés.
- Identifiant d'app : `dev.micam.postflop-lab` ; nom produit : `Postflop Lab` ; nom de paquet : `postflop-lab`.
- Le crate moteur garde son nom `postflop-solver`.
- Warnings clippy existants tolérés (pas de `-D warnings`).
- Version de l'app inchangée (`0.2.7`) ; la numérotation sera décidée à la première release.

## Review Focus

1. **`desktop/dist` absent** → `cargo build --workspace` échoue (la macro Tauri exige `distDir`). Attendu : la CI construit le front avant le job Rust, et le README racine documente `npm run build` avant tout `cargo build`. Couvert en Tasks 1, 5 et 6.
2. **Cargo.lock de 2023 sur un Rust récent** : `time 0.3.29` ne compile plus depuis Rust 1.80. Attendu : `cargo update -p time` uniquement, pas de mise à jour globale du lock. Couvert en Task 1.
3. **Bruit de mesure du bench** : un écart de quelques % entre variantes peut n'être que du bruit. Attendu : médiane de 5 runs, même machine, sur secteur, rien d'autre de lourd ; écart < 3 % = « équivalent ». Couvert en Tasks 2 et 3.
4. **Port `allocator-api2` et ordre LIFO** : `StackAlloc` panique si une désallocation n'est pas en ordre de pile (ex. un `Vec` qui grossit). Attendu : tests et les trois exemples passent avec `--features custom-alloc`, avec et sans compression. Couvert en Task 3.
5. **Changement d'identifiant** : le dossier de données WebView2 change, donc les configs sauvegardées (IndexedDB/Dexie) de l'ancienne « Desktop Postflop » ne seront pas visibles. Attendu : accepté, signalé dans la description de PR. Couvert en Task 6.

---

### Task 0 : Prérequis machine (utilisateur)

Aucun Rust ni `gh` n'est installé sur la machine (vérifié le 2026-11-15 : ni `~/.cargo` ni `~/.rustup`).

- [ ] **Step 1 :** Installer rustup : `winget install Rustlang.Rustup`, puis rouvrir le terminal.
- [ ] **Step 2 :** Installer les MSVC Build Tools (charge « Développement Desktop en C++ ») si absents : `winget install Microsoft.VisualStudio.2022.BuildTools` puis cocher la charge dans l'installeur.
- [ ] **Step 3 :** `rustup toolchain install stable nightly --profile minimal --component rustfmt,clippy`
- [ ] **Step 4 :** Installer et authentifier GitHub CLI : `winget install GitHub.cli`, puis `gh auth login`.
- [ ] **Step 5 : Vérifier**
  Run : `rustc +stable --version; rustc +nightly --version; cargo --version; gh auth status`
  Expected : les quatre commandes répondent sans erreur. Noter la version stable exacte (`1.X.Y`) : elle sera épinglée en Task 1.

### Task 1 : Workspace Cargo + toolchain stable

**Files :**
- Create : `Cargo.toml` (racine), `rust-toolchain.toml`
- Move : `desktop/src-tauri/Cargo.lock` → `Cargo.lock` (via `git mv`, pour garder les versions épinglées)
- Modify : `desktop/src-tauri/Cargo.toml` (dépendance moteur, retrait `[profile.release]`)
- Modify : `.gitignore` (ajouter `/desktop/dist/` si besoin ; `/target/` y est déjà)

**Interfaces :**
- Produces : `cargo build --workspace` / `cargo test -p postflop-solver` sur stable ; crates `postflop-solver` et `desktop-postflop` (renommé en Task 5).

- [ ] **Step 1 :** `git switch dev && git switch -c chore/fondations`, puis commiter ce plan : `git add docs/superpowers/plans && git commit -m "docs: add foundations (chantier 0) plan"`.
- [ ] **Step 2 :** Créer `Cargo.toml` racine : `[workspace] members = ["engine", "desktop/src-tauri"]`, `resolver = "2"`, et y déplacer le `[profile.release]` de l'app tel quel (`codegen-units = 1`, `panic = "abort"`, `strip = true`). Les profils déclarés dans un membre sont ignorés : supprimer celui de `desktop/src-tauri/Cargo.toml`.
- [ ] **Step 3 :** Dans `desktop/src-tauri/Cargo.toml`, remplacer la dépendance git par `postflop-solver = { path = "../../engine" }`. Retirer `features = ["custom-alloc"]` : la feature exige nightly. La Task 4 tranchera sur l'allocateur.
- [ ] **Step 4 :** `git mv desktop/src-tauri/Cargo.lock Cargo.lock`
- [ ] **Step 5 :** Créer `rust-toolchain.toml` :
  ```toml
  [toolchain]
  channel = "1.X.Y"   # version stable exacte relevée en Task 0
  components = ["rustfmt", "clippy"]
  profile = "minimal"
  ```
- [ ] **Step 6 :** `cargo update -p time`. Ne pas lancer de `cargo update` global : seul `time` (0.3.29, cassé depuis Rust 1.80) doit bouger. Si d'autres crates refusent de compiler, les mettre à jour une par une avec `-p` et le noter dans le message de commit.
- [ ] **Step 7 : Vérifier**
  Run : `cd desktop && npm ci && npm run build && cd .. && cargo build --workspace && cargo test -p postflop-solver --release && cargo run --release -p postflop-solver --example basic`
  Expected : build OK, tests verts, l'exemple affiche une exploitabilité et ses `assert_eq!` passent. `Cargo.lock` racine contient `postflop-solver` sans `source = "git+…"`.
- [ ] **Step 8 : Commit**
  ```bash
  git add Cargo.toml Cargo.lock rust-toolchain.toml desktop/src-tauri/Cargo.toml .gitignore
  git commit -m "build: add Cargo workspace and pin stable toolchain"
  ```

### Task 2 : Bench de référence + mesures (a), (b), (c)

**Files :**
- Create : `engine/benches/common/mod.rs`, `engine/benches/reference_spot.rs`, `engine/benches/reference_spot_mimalloc.rs`
- Create : `docs/benchmarks/allocateur.md`
- Modify : `engine/Cargo.toml` (`[dev-dependencies] mimalloc`, deux `[[bench]]` avec `harness = false`)

**Interfaces :**
- Produces : `pub fn run(variant: &str)` dans `common/mod.rs`. Chaque bench l'appelle, et `reference_spot_mimalloc.rs` déclare `#[global_allocator] static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;`. Commandes :
  - (a) `cargo +nightly bench -p postflop-solver --bench reference_spot --features custom-alloc`
  - (b) `cargo bench -p postflop-solver --bench reference_spot`
  - (c) `cargo bench -p postflop-solver --bench reference_spot_mimalloc`
  - (d) `cargo bench -p postflop-solver --bench reference_spot --features custom-alloc` (après Task 3)

- [ ] **Step 1 :** Écrire `run`. Spot figé : celui de `engine/examples/basic.rs` (ranges, `Td9d6h` + `Qc`, `"60%, e, a"` / `"2.5x"`, pot 200, stack 900, donk river `"50%"`, seuils 1.5 / 0.15 / 0.1), avec `allocate_memory(false)`. Constantes `ITERATIONS = 200` et `RUNS = 5`. Pour chaque run, construire le jeu, chronométrer (`std::time::Instant`) uniquement la boucle `for i in 0..ITERATIONS { solve_step(&game, i) }`, puis calculer `compute_exploitability(&game)` hors chrono. Label de variante : `"custom-alloc"` si `cfg!(feature = "custom-alloc")`, sinon `"system"`, préfixé de `"mimalloc+"` dans le bench mimalloc. Sortie, une ligne finale :
  `variant=<label> iterations=200 runs=5 median_ms=<u128> min_ms=<u128> max_ms=<u128> exploitability=<f32 {:.4}>`
- [ ] **Step 2 :** Déclarer dans `engine/Cargo.toml` : `mimalloc = "<dernière 0.1.x>"` en dev-dependency, `[[bench]] name = "reference_spot" harness = false` et idem pour `reference_spot_mimalloc`.
- [ ] **Step 3 : Vérifier (b)**
  Run : `cargo bench -p postflop-solver --bench reference_spot`
  Expected : la ligne `variant=system …` s'affiche. Si `median_ms` < 2000, passer `ITERATIONS` à 500 **avant** toute mesure retenue, et garder la valeur pour toutes les variantes.
- [ ] **Step 4 : Mesurer (a), (b), (c)** avec les trois commandes ci-dessus, sur secteur et sans autre charge lourde. Expected : trois lignes. Les exploitabilités doivent être égales à 0,1 % près (l'allocateur ne change pas le calcul). Sinon, s'arrêter et enquêter.
- [ ] **Step 5 :** Écrire `docs/benchmarks/allocateur.md` : machine (CPU, nb de threads, RAM, OS), versions `rustc` stable et nightly, commandes, tableau `variante | médiane ms | min | max | écart vs (a) %`. La ligne (d) est laissée « à mesurer (Task 3) ».
- [ ] **Step 6 : Commit**
  ```bash
  git add engine/benches engine/Cargo.toml Cargo.lock docs/benchmarks/allocateur.md
  git commit -m "perf: add reference-spot allocator benchmark"
  ```

### Task 3 : Port de `custom-alloc` sur `allocator-api2` + mesure (d)

**Files :**
- Modify : `engine/Cargo.toml` (`allocator-api2 = { version = "<dernière 0.2.x>", optional = true }`, `custom-alloc = ["dep:allocator-api2"]`)
- Modify : `engine/src/lib.rs:38` (doc de la feature : plus « nightly only ») et `:54` (supprimer le `#![cfg_attr(…, feature(allocator_api))]`)
- Modify : `engine/src/alloc.rs` (importer `Allocator`, `AllocError` depuis `allocator_api2::alloc` ; `Layout` et `alloc`/`dealloc` restent ceux de `std::alloc`)
- Modify : `engine/src/solver.rs`, `engine/src/utility.rs` : sous `cfg(feature = "custom-alloc")`, utiliser `allocator_api2::vec::Vec` pour tous les `Vec::with_capacity_in(…, StackAlloc)` et les types de retour `Vec<f32, StackAlloc>`. Les branches `not(custom-alloc)` ne changent pas.
- Modify : `docs/benchmarks/allocateur.md`

**Interfaces :**
- Consumes : bench de Task 2.
- Produces : feature `custom-alloc` compilable sur stable, mêmes noms de fonctions (`regret_matching`, `normalized_strategy_custom_alloc`, …).

- [ ] **Step 1 : Constater l'échec actuel**
  Run : `cargo build -p postflop-solver --features custom-alloc`
  Expected : FAIL sur stable (`#![feature]` may not be used on the stable release channel).
- [ ] **Step 2 :** Faire le port décrit dans Files. Ne pas utiliser la feature `nightly` d'`allocator-api2`.
- [ ] **Step 3 : Vérifier**
  Run : `cargo test -p postflop-solver --release --features custom-alloc -- --test-threads 1`, puis `cargo run --release -p postflop-solver --features custom-alloc --example basic`, et idem `--example file_io` et `--example node_locking`. Lancer aussi `cargo clippy -p postflop-solver --features custom-alloc`.
  Expected : tout vert, aucune panique `deallocation error` / `freeing error`. Si `basic` ne couvre pas la compression, ajouter un run temporaire avec `allocate_memory(true)` sans le commiter.
- [ ] **Step 4 : Vérifier la non-régression sans la feature**
  Run : `cargo test -p postflop-solver --release`
  Expected : vert.
- [ ] **Step 5 : Mesurer (d)** avec `cargo bench -p postflop-solver --bench reference_spot --features custom-alloc`. Expected : exploitabilité égale à celle de (a) à 0,1 % près. Compléter le tableau dans `docs/benchmarks/allocateur.md`.
- [ ] **Step 6 : Commit**
  ```bash
  git add engine docs/benchmarks/allocateur.md Cargo.lock
  git commit -m "perf(engine): port custom-alloc to allocator-api2 for stable Rust"
  ```

### Task 4 : Choix de l'allocateur

**Files :**
- Modify : `docs/benchmarks/allocateur.md` (section « Décision »)
- Modify, selon le choix : `desktop/src-tauri/Cargo.toml` et/ou `desktop/src-tauri/src/main.rs`

- [ ] **Step 1 : Appliquer la règle du spec.** Prendre la plus rapide parmi (b), (c), (d) ; en cas d'écart < 3 %, préférer la plus simple : (b), puis (c), puis (d). **Si aucune n'est à moins de 10 % de (a) : s'arrêter et présenter les chiffres à l'utilisateur. Ne pas continuer.**
- [ ] **Step 2 : Appliquer côté app.**
  - (b) : rien à changer.
  - (c) : ajouter `mimalloc` aux dépendances de l'app et `#[global_allocator] static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;` dans `desktop/src-tauri/src/main.rs`.
  - (d) : `postflop-solver = { path = "../../engine", features = ["custom-alloc"] }`.
- [ ] **Step 3 :** Rédiger la section « Décision » : option retenue, chiffres, raison.
- [ ] **Step 4 : Vérifier**
  Run : `cargo build --workspace --release`
  Expected : OK.
- [ ] **Step 5 : Commit**
  ```bash
  git add desktop/src-tauri docs/benchmarks/allocateur.md Cargo.lock
  git commit -m "perf: select <option> allocator for the desktop app"
  ```

### Task 5 : Renommage « Postflop Lab »

**Files :**
- Modify : `desktop/src-tauri/tauri.conf.json` : `package.productName` → `Postflop Lab` ; `tauri.bundle.identifier` → `dev.micam.postflop-lab` ; `tauri.windows[0].title` → `Postflop Lab` ; `bundle.copyright` → `Copyright (C) 2022 Wataru Inariba, 2026 Michael Maccio`
- Modify : `desktop/src-tauri/Cargo.toml` : `name = "postflop-lab"`, `authors = ["Wataru Inariba", "Michael Maccio"]`, `repository = "https://github.com/micamdev/postflop-lab"`, `description = "Postflop GTO solver for study"`, `publish = false`
- Modify : `desktop/package.json` (`"name": "postflop-lab"`) et `desktop/package-lock.json` (champs `name` en tête, via `npm install --package-lock-only`)
- Modify : `desktop/index.html` (`<title>`), `desktop/src/components/NavBar.vue:8,15`, `desktop/src/components/AboutPage.vue:2-10`
- Modify : `README.md` racine (section « Développement »), `desktop/README.md`

- [ ] **Step 1 :** Appliquer les changements ci-dessus. NavBar : titre `Postflop Lab`, lien vers `https://github.com/micamdev/postflop-lab`. AboutPage : `Postflop Lab v0.2.7`, lien vers le nouveau repo, et garder le lien `b-inary/desktop-postflop` sous une mention « Based on desktop-postflop by Wataru Inariba ». L'allowlist `shell.open` (`^https://github.com/`) couvre déjà les deux liens.
- [ ] **Step 2 :** README racine : ajouter une section « Développement » avec les prérequis (rustup, MSVC Build Tools, Node 22) et l'ordre des commandes : `cd desktop && npm ci && npm run build` (requis avant tout `cargo build`, car Tauri exige `desktop/dist`), puis `npm run tauri dev`, `cargo test --workspace --release`, et la commande de bench. `desktop/README.md` : en tête, un paragraphe qui renvoie au README racine. Le texte d'origine est conservé dessous, sous « Original README ».
- [ ] **Step 3 : Vérifier**
  Run : `git grep -n -i "desktop postflop\|desktop-postflop\|b-inary.desktop" -- desktop ':!desktop/README.md' ':!desktop/package-lock.json'`
  Expected : seules restent la mention de crédit dans AboutPage et l'URL `b-inary/desktop-postflop`.
  Run : `cargo build --workspace` et `cd desktop && npx vue-tsc --noEmit`
  Expected : OK.
- [ ] **Step 4 : Commit**
  ```bash
  git add -A desktop README.md Cargo.lock
  git commit -m "chore: rename app to Postflop Lab"
  ```

### Task 6 : CI GitHub Actions + workflow de release

**Files :**
- Create : `.github/workflows/ci.yml`
- Move + Modify : `desktop/.github/workflows/release.yml` → `.github/workflows/release.yml` (`git mv`)
- Delete : `engine/.github/` (remplacé par la CI racine)

**Interfaces :**
- Consumes : option d'allocateur de Task 4, noms de Task 5.

- [ ] **Step 1 :** `ci.yml`. Déclencheurs : `pull_request` vers `dev`/`main`, `push` sur `dev`/`main`. `env: CARGO_TERM_COLOR: always`.
  - Job `rust` (`windows-latest`, la plateforme cible de l'utilisateur, ce qui évite la dépendance webkit2gtk-4.0 de Tauri 1 sous Linux) : `actions/checkout@v4` ; `actions/setup-node@v4` (node 22, cache npm, `cache-dependency-path: desktop/package-lock.json`) ; `npm ci && npm run build` dans `desktop` (pour `desktop/dist`) ; `actions-rust-lang/setup-rust-toolchain@v1` (lit `rust-toolchain.toml`, gère le cache) ; puis `cargo fmt --all --check`, `cargo clippy --workspace --all-targets`, `cargo test --workspace --release`. Si (d) a été retenu en Task 4, ajouter `cargo test -p postflop-solver --release --features custom-alloc -- --test-threads 1`.
  - Job `front` (`ubuntu-latest`, `working-directory: desktop`) : checkout, setup-node 22 avec cache, `npm ci`, `npm run lint`, `npx vue-tsc --noEmit`.
- [ ] **Step 2 :** `release.yml` : `actions/checkout@v4`, `setup-node@v4` (node 22), `actions-rust-lang/setup-rust-toolchain@v1` à la place de nightly. Matrice `[windows-latest, ubuntu-22.04]` (Linux : `libwebkit2gtk-4.0-dev`, introuvable sur 24.04). `npm ci` et `npm run tauri build -- --target <triple>` avec `working-directory: desktop` et **sans** les flags `-Z build-std…`. `softprops/action-gh-release@v2`. Chemins d'artefacts à la racine : `target/<triple>/release/…`, avec les nouveaux noms (`Postflop Lab.exe`, `Postflop Lab_*_x64_en-US.msi`, `postflop-lab_*_amd64.deb`, `postflop-lab_*_amd64.AppImage`).
- [ ] **Step 3 : Vérifier les noms Windows**
  Run : `cd desktop && npm run tauri build -- --target x86_64-pc-windows-msvc`
  Expected : les fichiers `.exe` et `.msi` produits sous `target/x86_64-pc-windows-msvc/release/` correspondent exactement aux motifs de `release.yml`. Sinon, corriger les motifs.
- [ ] **Step 4 : Vérifier localement ce que la CI lancera**
  Run : `cargo fmt --all --check && cargo clippy --workspace --all-targets && cargo test --workspace --release`, puis `cd desktop && npm run lint && npx vue-tsc --noEmit`
  Expected : tout passe. Si `cargo fmt --check` ou `npm run lint` échouent sur du code d'origine, corriger dans un commit `style:` séparé (`cargo fmt --all` / `npm run format`) **sans autre changement**.
- [ ] **Step 5 : Commit**
  ```bash
  git add .github desktop/.github engine/.github
  git commit -m "ci: add workspace CI and adapt release workflow"
  ```

### Task 7 : Vérification finale et PR

- [ ] **Step 1 : Vérifier l'app (manuel, utilisateur)**
  Run : `cd desktop && npm run tauri dev`
  Expected : la fenêtre « Postflop Lab » s'ouvre. Un spot (ex. celui du bench) se construit, se résout et s'affiche comme avant. L'About montre le nouveau nom et les crédits.
- [ ] **Step 2 :** `git push -u origin chore/fondations`
- [ ] **Step 3 :** `gh pr create --base dev --title "chore: foundations (chantier 0)"`. Le corps résume les tâches et le tableau du bench, et signale que les configs sauvegardées de l'ancienne app ne sont pas reprises (changement d'identifiant). Il se termine par la ligne d'attribution « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».
- [ ] **Step 4 : Vérifier la CI**
  Run : `gh pr checks --watch`
  Expected : jobs `rust` et `front` verts.
