# Chantier 1 — Tauri 2 et dépendances : plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** l'app passe à Tauri 2, au gestionnaire pnpm et à des dépendances à jour, sans changer son comportement ni ses performances.

**Architecture :** cinq étapes successives sur la branche `chore/tauri-2`, chacune vérifiée avant la suivante : pnpm, Tauri 2, dépendances du front, dépendances Rust, puis build de release et PR. L'interface Rust ↔ front (`invoke` des commandes de `desktop/src-tauri/src/`) ne change pas ; seuls les appels aux API Tauri (dialogues, fichiers, liens) passent par des plugins.

**Tech Stack :** Tauri 2.12.x et plugins dialog / fs / opener 2.x, pnpm 10, Node 24, Vite 8, Vue 3.5, ESLint 10 (config flat), vue-tsc 3, Tailwind 3.4.x, Rust 1.100.0.

**Spec :** `docs/superpowers/specs/2026-11-15-tauri-2-dependances-design.md`

## Global Constraints

- Branche `chore/tauri-2` (existe déjà, avec le design), PR vers `dev`.
- Commits sans ligne `Co-Authored-By` (consigne utilisateur). Messages conventionnels.
- Comportement et UI inchangés ; vitesse de résolution inchangée, en release comme en dev (profils dev du chantier 0 conservés dans `Cargo.toml`).
- Tauri **2.x stable** (2.12.x), jamais `3.0.0-alpha`. Plugins en 2.x.
- Tailwind reste en **3.4.x** et `@tailwindcss/forms` en 0.5.x. Tout le reste du front : dernière version majeure.
- `bincode` en **2.0.1** (3.0.0 est une version vide de fin de maintenance).
- Permissions Tauri : uniquement dialogues `open`/`save`, lecture/écriture de fichiers texte sur les chemins choisis via un dialogue, ouverture d'URL limitée à `https://github.com/*`. Pas de `fs:default`, pas de scope disque large.
- Exécutable Windows : `postflop-lab.exe` (défaut Tauri 2, pas de `mainBinaryName`).
- Node 24 en CI. Dans les workflows, une commande par étape `run` (issue #6).
- Commandes cargo : `cargo` est dans `~/.cargo/bin` (l'ajouter au PATH du shell si besoin). `gh` est `"C:\Program Files\GitHub CLI\gh.exe"`.

## Review Focus

1. **Portée fs** : un fichier choisi dans un dialogue doit se lire et s'écrire ; aucun autre chemin ne doit être accessible. Couvert en Task 2 (vérification du fichier de capacités) et en Task 5 (test manuel import/export).
2. **Liens `target="_blank"`** (`NavBar.vue`, `AboutPage.vue`) : ils doivent s'ouvrir dans le navigateur, pas dans la fenêtre de l'app. Couvert en Task 2 (opener avec interception des liens) et Task 5 (test manuel).
3. **Données Dexie existantes** : les configurations déjà sauvegardées en dev (IndexedDB, schéma `version(2)` de `src/db.ts`) doivent s'ouvrir avec Dexie 4. Couvert en Task 3 (schéma inchangé) et Task 5 (test manuel). Note : si l'origine change en Tauri 2 (`http://tauri.localhost`), ces données de dev ne sont pas visibles ; c'est accepté (aucune release), à consigner dans l'issue #8.
4. **Variables d'environnement de build** : Tauri 2 renomme `TAURI_PLATFORM`/`TAURI_DEBUG` en `TAURI_ENV_PLATFORM`/`TAURI_ENV_DEBUG`. Sans mise à jour de `vite.config.ts`, la cible de build et la minification sont silencieusement fausses. Couvert en Task 2.
5. **Rendu Tailwind 3.3 → 3.4** : écarts visuels mineurs possibles (preflight). Couvert en Task 5 (contrôle visuel par l'utilisateur).

---

### Task 1 : pnpm, versions inchangées

**Files :**
- Create : `desktop/pnpm-lock.yaml` ; Delete : `desktop/package-lock.json`
- Modify : `desktop/package.json` (`packageManager`, scripts), `desktop/src-tauri/tauri.conf.json` (`beforeDevCommand`, `beforeBuildCommand`), `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `README.md` (section Development)

**Interfaces :**
- Produces : commandes `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm tauri …` utilisées par toutes les tâches suivantes.

- [ ] **Step 1 :** Relever les versions installées actuelles : `cd desktop && npm ls --depth 0 > ../.superpowers/versions-npm.txt`.
- [ ] **Step 2 :** `pnpm import` (depuis `package-lock.json`), puis `git rm package-lock.json`, `rm -rf node_modules`, `pnpm install`. Ajouter `"packageManager": "pnpm@<version de pnpm --version>"` dans `package.json`. Dans `tauri.conf.json` : `"beforeBuildCommand": "pnpm build"`, `"beforeDevCommand": "pnpm dev"`.
- [ ] **Step 3 : Vérifier que les versions n'ont pas bougé**
  Run : `pnpm ls --depth 0` et comparer à `versions-npm.txt`.
  Expected : mêmes versions pour chaque dépendance directe.
- [ ] **Step 4 :** CI. Dans `ci.yml` (jobs `rust` et `front`) et `release.yml` : `pnpm/action-setup@v4` (version lue depuis `packageManager`) avant `actions/setup-node@v4` avec `node-version: 24`, `cache: pnpm`, `cache-dependency-path: desktop/pnpm-lock.yaml` ; `pnpm install --frozen-lockfile` à la place de `npm ci` ; `pnpm build`, `pnpm lint`, `pnpm exec vue-tsc --noEmit`, `pnpm tauri build -- --target …`. Une commande par étape `run` (issue #6). README : remplacer les commandes npm par pnpm, prérequis Node 24 et pnpm (via `corepack enable`).
- [ ] **Step 5 : Vérifier**
  Run : `pnpm build && pnpm lint && pnpm exec vue-tsc --noEmit`, puis `cargo build --workspace`, puis `pnpm tauri dev` lancé en arrière-plan jusqu'à la ligne `Running` de l'exécutable, puis arrêt.
  Expected : tout passe ; l'app démarre sans panique dans le log.
- [ ] **Step 6 : Commit**
  ```bash
  git add -A desktop .github README.md
  git commit -m "build: switch the front end to pnpm"
  ```

### Task 2 : Tauri 2

**Files :**
- Modify : `desktop/package.json` (`@tauri-apps/cli` 2.x, `@tauri-apps/api` 2.x, ajout de `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener`)
- Modify : `desktop/src-tauri/Cargo.toml` (`tauri` 2.12.x, `tauri-build` 2.x, `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-opener` 2.x ; features Tauri 1 supprimées)
- Modify : `desktop/src-tauri/tauri.conf.json` (format v2), `desktop/src-tauri/src/main.rs` (enregistrement des plugins)
- Create : `desktop/src-tauri/capabilities/default.json`
- Modify : `desktop/src/invokes.ts` (`invoke` depuis `@tauri-apps/api/core`), `desktop/src/components/DbItemPicker.vue:471,1226-1301`, `desktop/src/components/ResultTable.vue:373,1030-1036`
- Modify : `desktop/vite.config.ts` (`TAURI_ENV_*`)
- Modify : `.github/workflows/release.yml`, `Cargo.lock`, `desktop/pnpm-lock.yaml`

**Interfaces :**
- Consumes : commandes pnpm de Task 1.
- Produces : app Tauri 2 ; commandes Rust (`#[tauri::command]`) inchangées, mêmes noms et signatures.

- [ ] **Step 1 :** `pnpm add -D @tauri-apps/cli@^2`, puis `pnpm tauri migrate`. Relire le diff produit avant de continuer.
- [ ] **Step 2 :** Compléter à la main ce que `migrate` n'a pas fait :
  - `main.rs` : `.plugin(tauri_plugin_dialog::init())`, `.plugin(tauri_plugin_fs::init())`, `.plugin(tauri_plugin_opener::init())`. L'interception des clics sur les liens `target="_blank"` de l'opener (`open_js_links_on_click`) doit rester active.
  - `capabilities/default.json` : fenêtre `main`, permissions exactement :
    ```json
    ["core:default", "dialog:allow-open", "dialog:allow-save",
     "fs:allow-read-text-file", "fs:allow-write-text-file",
     {"identifier": "opener:allow-open-url", "allow": [{"url": "https://github.com/*"}]}]
    ```
    Supprimer toute capacité ou permission plus large générée par `migrate` (ex. `fs:default`, `shell:*`, scopes `$HOME/**`). Le plugin dialog ajoute de lui-même le chemin choisi au scope fs.
  - Front : imports `open`/`save` depuis `@tauri-apps/plugin-dialog`, `readTextFile`/`writeTextFile` depuis `@tauri-apps/plugin-fs`. En v2, `open()` renvoie `string | null` (adapter le test de type dans `DbItemPicker.vue` si besoin).
  - `vite.config.ts` : `envPrefix: ["VITE_", "TAURI_ENV_"]`, `process.env.TAURI_ENV_PLATFORM`, `process.env.TAURI_ENV_DEBUG`.
  - `tauri.conf.json` : `productName`, `identifier` (`dev.micam.postflop-lab`), titre et tailles de fenêtre, CSP, copyright, icônes inchangés. Pas de `mainBinaryName`.
- [ ] **Step 3 : Vérifier les permissions**
  Run : `grep -rn "fs:default\|fs:scope\|shell:\|\\$HOME\|\\*\\*" desktop/src-tauri/capabilities/`
  Expected : aucune ligne.
- [ ] **Step 4 :** `release.yml` : runner Linux `ubuntu-24.04` avec `libwebkit2gtk-4.1-dev` (au lieu de 4.0) en plus de `libgtk-3-dev librsvg2-dev` et `libayatana-appindicator3-dev` ; motifs d'artefacts : `target/<triple>/release/postflop-lab.exe`, `target/<triple>/release/bundle/msi/*.msi`, `target/<triple>/release/bundle/deb/*.deb`, `target/<triple>/release/bundle/appimage/*.AppImage`.
- [ ] **Step 5 : Vérifier**
  Run : `cargo fmt --all --check && cargo clippy --workspace --all-targets && cargo test --workspace --release`, puis `pnpm build && pnpm lint && pnpm exec vue-tsc --noEmit`, puis `pnpm tauri dev` jusqu'au démarrage de l'exécutable.
  Expected : tout passe ; l'app démarre ; aucune erreur `not allowed` / `permission` dans le log au démarrage.
- [ ] **Step 6 : Commit**
  ```bash
  git add -A desktop .github Cargo.lock
  git commit -m "feat: migrate the desktop app to Tauri 2"
  ```

### Task 3 : dépendances du front

**Files :**
- Modify : `desktop/package.json`, `desktop/pnpm-lock.yaml`, `desktop/tsconfig.json`, `desktop/tsconfig.node.json`, `desktop/vite.config.ts` (si l'API Vite 8 l'exige)
- Create : `desktop/eslint.config.js` ; Delete : `desktop/.eslintrc.cjs`, `desktop/.eslintignore`
- Modify : fichiers `desktop/src/**` seulement pour des corrections mécaniques imposées par les nouvelles versions

**Interfaces :**
- Consumes : app Tauri 2 de Task 2.

- [ ] **Step 1 :** `pnpm up --latest` puis ramener Tailwind : `pnpm add -D tailwindcss@^3.4 @tailwindcss/forms@^0.5`. Retirer `@rushstack/eslint-patch` (inutile en config flat). Ajouter les pairs requis (ex. `@vue/devtools-api` pour Pinia 4).
- [ ] **Step 2 :** TypeScript : garder `typescript@latest` si `pnpm exec vue-tsc --noEmit` fonctionne avec ; sinon descendre à la dernière version majeure que vue-tsc supporte, et le consigner dans le message de commit.
- [ ] **Step 3 :** ESLint 10 : `eslint.config.js` qui reproduit la config actuelle : `pluginVue.configs["flat/essential"]`, la config TypeScript recommandée de `@vue/eslint-config-typescript` (`defineConfigWithVueTs`, `vueTsConfigs.recommended`), `skipFormatting` de `@vue/eslint-config-prettier`, règle `@typescript-eslint/no-unused-vars: ["warn", { argsIgnorePattern: "^_" }]`, ignores `dist/**`. Script `lint` : `eslint src`. `tsconfig.json` : `"moduleResolution": "Bundler"`.
- [ ] **Step 4 :** Vérifier que le schéma Dexie de `src/db.ts` (classe, nom de base, `version(1)` et `version(2)`) est inchangé : `git diff dev -- desktop/src/db.ts` → vide ou seulement des types.
- [ ] **Step 5 : Vérifier**
  Run : `pnpm build && pnpm lint && pnpm exec vue-tsc --noEmit`, puis `pnpm tauri dev` jusqu'au démarrage.
  Expected : tout passe. Les nouvelles règles de lint qui signalent du code d'origine : corriger si c'est mécanique, sinon désactiver la règle dans `eslint.config.js` avec un commentaire et ouvrir une issue `tech debt`.
- [ ] **Step 6 : Commit**
  ```bash
  git add -A desktop
  git commit -m "build: upgrade front-end dependencies (Tailwind kept on 3.4)"
  ```

### Task 4 : dépendances Rust et rust-version

**Files :**
- Modify : `Cargo.toml` (ajouter `[workspace.package] rust-version = "1.100"`), `engine/Cargo.toml`, `desktop/src-tauri/Cargo.toml` (`rust-version.workspace = true` dans les deux, remplace `"1.65"`), `Cargo.lock`
- Modify : `desktop/src-tauri/src/main.rs:18,97-99` (API sysinfo 0.40) ; `engine/src/file.rs` seulement si l'API bincode 2.0.1 l'exige
- Modify : `docs/benchmarks/allocateur.md` (ligne de contrôle)

- [ ] **Step 1 :** `cargo update`, puis versions dans les manifestes : `sysinfo = "0.40"`, `rayon = "1.12"` (app et moteur), `zstd = { version = "0.14", … }`, `bincode = { version = "2.0.1", optional = true }`, et dernières versions de `regex`, `once_cell`, `serde`, `serde_json`.
- [ ] **Step 2 :** Adapter `memory()` dans `main.rs` à sysinfo 0.40 (plus de `SystemExt` ; `System::new()` + `refresh_memory()` suffisent). Retour inchangé : `(available_memory, total_memory)` en octets.
- [ ] **Step 3 : Vérifier**
  Run : `cargo fmt --all --check && cargo clippy --workspace --all-targets && cargo test --workspace --release && cargo test -p postflop-solver --release --features zstd && cargo test -p postflop-solver --release --features custom-alloc -- --test-threads 1 && cargo run --release -p postflop-solver --features zstd --example file_io`
  Expected : tout passe ; `file_io` (sérialisation bincode, avec et sans compression) s'exécute sans erreur.
- [ ] **Step 4 : Bench de contrôle**
  Run : 3 fois `cargo bench -p postflop-solver --bench reference_spot`
  Expected : médiane dans ±7 % de la médiane (b) de `docs/benchmarks/allocateur.md` (2480 ms). Ajouter les trois valeurs dans une section « Contrôle chantier 1 » du doc. Hors de cette marge : s'arrêter et enquêter (rayon 1.12 est le candidat principal).
- [ ] **Step 5 :** Ouvrir l'issue « Choose the save format for solutions (bincode is unmaintained) » avec les labels `chantier 2`, et ajouter à l'issue #8 un commentaire sur le changement d'origine Tauri 2 (`http://tauri.localhost`) et l'exécutable `postflop-lab.exe`.
- [ ] **Step 6 : Commit**
  ```bash
  git add Cargo.toml Cargo.lock engine/Cargo.toml engine/src desktop/src-tauri docs/benchmarks/allocateur.md
  git commit -m "build: upgrade Rust dependencies and declare rust-version"
  ```

### Task 5 : build de release, vérification et PR

- [ ] **Step 1 : Vérifier les artefacts**
  Run : `cd desktop && pnpm tauri build -- --target x86_64-pc-windows-msvc`
  Expected : `target/x86_64-pc-windows-msvc/release/postflop-lab.exe` et un `.msi` sous `bundle/msi/`, conformes aux motifs de `release.yml` (sinon corriger les motifs et commiter `ci: fix release artifact paths`).
- [ ] **Step 2 :** `git push -u origin chore/tauri-2`, puis `gh pr create --base dev --title "chore: Tauri 2 and dependency upgrade (chantier 1)"`. Corps : résumé par tâche, versions clés, issues fermées (`Closes #2`, `Closes #3`, `Closes #6`), points d'attention (origine Tauri 2, nom de l'exécutable, bincode). Ligne finale : « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».
- [ ] **Step 3 : Vérifier la CI**
  Run : `gh pr checks --watch`
  Expected : `rust` et `front` verts.
- [ ] **Step 4 : Vérification manuelle (utilisateur)**, avec l'exécutable release de Step 1 puis `pnpm tauri dev` :
  - un spot se construit, se résout et s'affiche, à une vitesse comparable au chantier 0 ; Stop et Pause répondent ;
  - export puis import d'une configuration (`DbItemPicker`) ; export des résultats (`ResultTable`) ;
  - les liens GitHub (barre de navigation, About) s'ouvrent dans le navigateur ;
  - l'interface a le même rendu qu'avant (Tailwind 3.4).
