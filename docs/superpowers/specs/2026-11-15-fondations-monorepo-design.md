# Chantier 0 — Fondations : monorepo, toolchain, CI, renommage

Date : 2026-11-15
Statut : validé (étapes 1-2 réalisées)

## Contexte et pourquoi

Postflop Lab reprend `desktop-postflop` (b-inary), dont le développement est
suspendu, ainsi que son moteur `postflop-solver`, lui aussi suspendu.
Objectif global : un outil d'étude personnel, publiable s'il est réussi, avec
sauvegarde des solutions, node lock et une interface modernisée.

Ce chantier pose les fondations : sans elles, on ne peut ni modifier le moteur
proprement (nécessaire pour le node lock) ni garantir un build reproductible.

## Objectifs

- Moteur `postflop-solver` intégré dans le repo, historique conservé.
- Structure monorepo claire : app et moteur dans des dossiers dédiés.
- Build reproductible sur Rust **stable** épinglé, en local Windows et en CI.
- Performances de résolution au moins équivalentes à l'existant (mesurées).
- CI qui vérifie chaque PR (Rust + front).
- App renommée « Postflop Lab », crédits et licence AGPL d'origine intacts.
- Comportement de l'app strictement identique à avant.

## Non-objectifs

- Pas de montée de version Tauri 1 → 2 ni des dépendances front (chantier 1).
- Pas de nouvelle fonctionnalité, pas de changement d'UI.
- Pas de refacto du moteur au-delà de ce qu'exige le build.

## Anti-objectifs

- Perdre l'historique git ou l'attribution à l'auteur original.
- Un build qui ne marche que sur une machine.
- Une régression de vitesse de résolution passée inaperçue.

## Approches considérées

- **A. Repo neuf, app et moteur importés tous deux via `git subtree`
  (retenue).** Un repo, un commit pour changer moteur + app, historiques
  conservés, traitement symétrique des deux projets, pas de lien « fork »
  GitHub. Coût : remonter des modifs vers l'upstream est malaisé — sans objet,
  l'upstream est abandonné.
- A'. Garder le fork GitHub de desktop-postflop, y déplacer l'app via
  `git mv` et importer le moteur. Écartée : asymétrique, et le statut fork
  fait cibler les PR vers le repo d'origine par défaut.
- B. Fork séparé en sous-module git : double commit + bump de pointeur à
  chaque modif moteur. Rejetée : friction quotidienne sans bénéfice.
- C. Fork séparé épinglé par `rev` dans Cargo.toml : pire que B pour itérer.

Repartir d'un code vide (réécriture) a été écarté : perte d'historique,
d'attribution et d'une base fonctionnelle. Le repo neuf conserve tout le code
et les historiques d'origine.

## Design

### Structure cible

```
postflop-lab/
├── Cargo.toml            workspace Rust
├── Cargo.lock
├── rust-toolchain.toml   stable épinglé
├── desktop/              desktop-postflop (git subtree, historique conservé)
│   ├── package.json
│   ├── src/
│   └── src-tauri/
├── engine/               postflop-solver (git subtree, historique conservé)
├── docs/
├── .github/workflows/
├── LICENSE
└── README.md
```

Deux dossiers à la racine, sans niveau `apps/`/`crates/` : plus simple pour
deux composants ; on regroupera plus tard si d'autres apparaissent.

### Étapes

1. ✅ **Repo neuf** : commit initial (README avec crédits, LICENSE AGPL,
   `.gitignore`, `.gitattributes`).
2. ✅ **Imports** (sans `--squash`) :
   `git subtree add --prefix desktop https://github.com/b-inary/desktop-postflop main`
   `git subtree add --prefix engine https://github.com/b-inary/postflop-solver main`
   Le `.github/` de l'app importée (`desktop/.github/`) est remonté à la
   racine à l'étape CI. Constaté : `allocator_api` (feature `custom-alloc`)
   est la seule fonctionnalité nightly du moteur (`engine/src/lib.rs:54`).
3. **Workspace Cargo** à la racine : `members = ["engine", "desktop/src-tauri"]`.
   L'app dépend de `postflop-solver = { path = "../../engine" }`.
   Un seul `Cargo.lock` et un seul `target/` à la racine.
4. **Toolchain stable** : `rust-toolchain.toml` épinglant la dernière stable
   avec `rustfmt` et `clippy`. La feature `custom-alloc` du moteur (seule
   raison du nightly, via `allocator_api`) est désactivée côté app.
5. **Benchmark allocateur** : sur un spot de référence fixe (board, ranges,
   arbre, nb d'itérations identiques), mesurer le temps de résolution :
   (a) nightly + `custom-alloc` (référence actuelle), (b) stable sans,
   (c) stable + `mimalloc` en allocateur global, (d) stable + `custom-alloc`
   porté sur le crate `allocator-api2` (équivalent stable d'`allocator_api`,
   toujours non stabilisé dans Rust). Retenir (b), (c) ou (d) selon le
   résultat ; si aucun n'approche (a) à ~10 % près, revenir vers l'utilisateur.
   Le spot et la commande de bench sont commités pour être rejoués plus tard.
6. **CI** (`.github/workflows/ci.yml`, sur PR et push vers `dev`/`main`) :
   - Rust : `cargo fmt --check`, `cargo clippy`, `cargo test` (workspace).
   - Front (dans `desktop/`) : `npm ci`, `npm run lint`, `vue-tsc`.
   - `release.yml` adapté au nouveau layout, au stable et au nouveau nom.
7. **Renommage** : `productName` « Postflop Lab », identifier
   `dev.micam.postflop-lab`, `package.json`/`Cargo.toml` (`postflop-lab`),
   README réécrit en tête avec une section crédits vers b-inary, copyright
   d'origine conservé + ajout du nouveau mainteneur. Licence AGPL inchangée.
8. **Vérification** : `cargo test` vert, `npm run tauri dev` lance l'app, un
   spot se résout et s'affiche comme avant.

## Branches

`main` = releases, `dev` = intégration, une branche `feat/…`/`chore/…` par
chantier, mergée dans `dev` par PR.

## Prérequis machine (à faire par l'utilisateur)

- `rustup` (toolchain stable), MSVC Build Tools (C++), WebView2 (déjà présent
  sur Windows 11). Le nightly n'est nécessaire que pour la mesure de
  référence (a) du benchmark.
- Supprimer l'ancien fork GitHub `micamdev/postflop-lab` et recréer
  `micamdev/postflop-lab` vide (sans README/LICENSE/.gitignore).
- L'ancien dossier local `postflop-lap` peut être supprimé une fois le
  nouveau repo poussé.

## Décisions prises par Claude (modifiables)

- Identifier `dev.micam.postflop-lab` : format « domaine inversé » attendu par
  macOS/Windows pour éviter les collisions ; le domaine n'a pas besoin
  d'exister.
- Les warnings clippy existants peuvent être tolérés (`-D warnings` non
  imposé) dans ce chantier ; le durcissement viendra plus tard.
