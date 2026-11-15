# Chantier 1 — Tauri 2 et mise à jour des dépendances

Date : 2026-11-15
Statut : validé

## Contexte et pourquoi

Le chantier 0 a posé un monorepo buildable sur Rust stable, mais l'app tourne
toujours sur Tauri 1 et sur des dépendances de 2023 (Vite 4, ESLint 8,
vue-tsc 1…). Avant d'ajouter des fonctionnalités (sauvegarde des solutions,
node lock), on veut repartir d'une base maintenue : Tauri 1 ne reçoit plus
que des correctifs de sécurité, et chaque dépendance figée rend la suivante
plus dure à monter.

Aucune release de Postflop Lab n'existe encore : il n'y a pas de données
utilisateur à préserver entre versions.

## Objectifs

- App sur **Tauri 2**, dernière version stable (2.12.x au 2026-11-15).
- Front passé à **pnpm** (issue #2, gestionnaire habituel du mainteneur).
- Dépendances du front en **dernière version majeure**, sauf Tailwind.
- Dépendances Rust (app et moteur) à jour.
- `rust-version` vrai (issue #3).
- CI et release adaptées (pnpm, Ubuntu 24.04 pour Linux).
- Comportement de l'app strictement identique, performances incluses.

## Non-objectifs

- **Tailwind 4** : reste en 3.4.x. La refonte de l'UI (chantier 4) choisira son
  outillage ; migrer maintenant serait refait.
- **Tauri 3** : en alpha (3.0.0-alpha.6) ; on attend une version stable.
- Pas de nouvelle fonctionnalité, pas de changement d'UI.
- Pas de choix du format de sauvegarde des solutions (chantier 2).
- Pas de correction des warnings existants du moteur (issue #5).

## Anti-objectifs

- Perdre une fonction existante en route : import/export des configurations
  (`DbItemPicker.vue`, dialogues + fichiers texte), export des résultats
  (`ResultTable.vue`), liens GitHub, résolution, Stop/Pause.
- Des permissions Tauri 2 plus larges que l'allowlist actuelle.
- Une régression de vitesse de résolution, en release comme en dev.
- Un gros commit où l'on ne sait plus quelle mise à jour a cassé quoi.

## Approches considérées

- **A. Transformer l'existant par étapes, en partant de `tauri migrate`
  (retenue).** Une étape = un commit (ou une petite série), vérifiée avant la
  suivante. Garde l'historique et isole chaque risque.
- B. Créer un squelette Tauri 2 neuf (`create-tauri-app`) et y recopier le
  code. Écartée : contraire à la règle « on transforme l'existant, commit par
  commit », et casse le suivi de l'historique.
- C. Tout monter en un seul commit. Écartée : impossible de savoir quelle
  mise à jour casse un style ou un dialogue.

Portée des mises à jour du front (décidée avec l'utilisateur) : tout en
dernière version majeure **sauf Tailwind** (3.4.x). Alternatives écartées :
tout monter y compris Tailwind 4 (travail refait au chantier 4) ; le strict
minimum pour Tauri 2 (dette reportée).

## Design

Branche `chore/tauri-2` depuis `dev`, PR vers `dev`. Étapes, dans cet ordre :

### 1. pnpm, versions inchangées

- `pnpm import` depuis `desktop/package-lock.json`, puis suppression du
  lockfile npm. Aucune version ne change à cette étape : on isole l'effet du
  changement de gestionnaire.
- `packageManager` épinglé dans `desktop/package.json` (Corepack).
- `tauri.conf.json` : `beforeDevCommand`/`beforeBuildCommand` en `pnpm …`.
- CI : `pnpm/action-setup` + cache pnpm. README : commandes en `pnpm`.

### 2. Tauri 2

- `pnpm tauri migrate` (CLI 2.x), puis ajustements à la main.
- Crates : `tauri` 2.12.x, `tauri-build` 2.x, plugins `tauri-plugin-dialog`,
  `tauri-plugin-fs`, `tauri-plugin-opener` (2.x).
- Front : `@tauri-apps/api` 2.x (`invoke` depuis `@tauri-apps/api/core`),
  `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`,
  `@tauri-apps/plugin-opener`.
- **Permissions** (`src-tauri/capabilities/`), équivalentes à l'allowlist
  actuelle, pas plus :
  - dialogues `open` et `save` ;
  - lecture et écriture de fichiers texte **limitées aux chemins choisis par
    l'utilisateur via un dialogue** (pas de scope disque large) ;
  - ouverture d'URL limitée à `https://github.com/*`.
- CSP inchangée. Identifiant, nom produit et fenêtre inchangés.
- Profils dev du chantier 0 (moteur et app optimisés) conservés.

### 3. Dépendances du front

Dernière version majeure de chaque paquet, notamment : Vite 8 et
`@vitejs/plugin-vue` 6, Vue 3.5, vue-tsc 3, ESLint 10 (passage à la config
« flat » `eslint.config.js`) avec `eslint-plugin-vue`,
`@vue/eslint-config-typescript` et `@vue/eslint-config-prettier` à jour,
Prettier, Pinia 4, Dexie 4, chart.js / vue-chartjs, vue-tippy, heroicons,
`@types/node`. **Tailwind 3.4.x** et `@tailwindcss/forms` 0.5.x.
**TypeScript** : la version la plus récente que vue-tsc supporte réellement
(TypeScript 7 est le compilateur natif, à vérifier ; sinon dernière 5.x/6.x).

Node : 24 (LTS active) en CI et en local ; Vite 8 exige ≥ 20.19.

### 4. Dépendances Rust

- `cargo update` global, puis montées de versions majeures :
  `sysinfo` 0.40 (API changée : `SystemExt` disparaît), `rayon` 1.12,
  `zstd` 0.14, `bincode` **2.0.1** (version finale ; 3.0.0 est une version
  vide de fin de maintenance), `regex`, `once_cell`, `serde`, `serde_json`.
- `bincode` n'est plus maintenu : le choix du format de sauvegarde des
  solutions est reporté au chantier 2, à noter dans une issue.
- **`rust-version`** (issue #3) : déclaré une fois dans
  `[workspace.package]` à la racine, égal à la toolchain épinglée dans
  `rust-toolchain.toml` (la seule version testée), et hérité par les deux
  crates (`rust-version.workspace = true`).

### 5. CI et release

- `ci.yml` : pnpm, Node 24. Les étapes réécrites séparent les commandes
  (corrige au passage l'issue #6).
- `release.yml` : pnpm, Node 24, Linux en **`ubuntu-24.04`** avec
  `libwebkit2gtk-4.1-dev` (Tauri 2). L'exécutable Windows prend le nom par
  défaut de Tauri 2, celui du paquet Cargo : `postflop-lab.exe` (décidé avec
  l'utilisateur ; pas de `mainBinaryName`). Les noms des installeurs suivent
  toujours `productName`. Noms d'artefacts revérifiés par un build local.

### 6. Vérification

À chaque étape : CI verte (fmt, clippy, tests, lint, vue-tsc), `pnpm tauri
dev` démarre. En fin de chantier, vérification manuelle par l'utilisateur :

- un spot se construit, se résout, s'affiche ; Stop et Pause répondent ;
- import et export d'une configuration (`DbItemPicker`), export des résultats
  (`ResultTable`) ;
- le lien GitHub s'ouvre dans le navigateur ;
- release locale (`pnpm tauri build`) aussi rapide que celle du chantier 0 ;
  bench de référence (`docs/benchmarks/allocateur.md`) rejoué pour (b), écart
  attendu dans le bruit (±7 %).

Issues fermées par la PR : #2, #3, #6.

## Laissé au builder

- Le détail des changements de code imposés par les nouvelles API (sysinfo,
  ESLint flat config, plugins Tauri).
- Les règles de lint désactivées ou ajustées si la nouvelle config ESLint
  signale du code d'origine : corriger seulement ce qui est mécanique, sinon
  désactiver la règle avec un commentaire et une issue.
- Garder ou non le paramètre `useHttpsScheme` (origine `http://tauri.localhost`
  par défaut en Tauri 2 sous Windows) : sans release existante, le défaut
  convient ; à documenter dans l'issue des notes de release (#8).
