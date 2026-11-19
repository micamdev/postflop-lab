# Avantage de range et de nuts (onglet Compare) : plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** afficher dans l'onglet Compare la répartition des ranges OOP et IP en tranches d'équité et une synthèse « Nut advantage ».

**Architecture :** une fonction pure `equityBuckets` dans `utils.ts`, utilisée par `ResultCompare.vue` à partir des résultats déjà reçus (`equity`, `normalizer`). Aucun changement Rust.

**Tech Stack :** Vue 3, TypeScript.

**Spec :** `docs/superpowers/specs/2026-11-16-avantage-de-nuts-design.md`

## Global Constraints

- Branche `feat/nut-advantage`, PR vers `dev`, commits sans `Co-Authored-By`.
- Tranches : ≥ 90 %, 75-90 %, 50-75 %, < 50 % (bornes : `e >= 0.9`, `0.75 <= e < 0.9`, `0.5 <= e < 0.75`, `e < 0.5`).
- Parts en % de la range, pondérées par `normalizer` (comme l'équité moyenne de Compare).
- Synthèse sur la tranche ≥ 90 % ; « — » si l'écart est < 1 point de % ; rien si une range est vide (`results.isEmpty`).
- `pnpm lint` sans warning, `vue-tsc` vert.

## Review Focus

1. Range vide d'un joueur (`isEmpty`) : pas de NaN affiché, pas d'erreur. Couvert en Step 3.
2. Nœud terminal ou river recalculée : la vue s'affiche comme les autres lignes. Couvert en Step 4.

---

### Task 1 : tranches d'équité dans Compare

**Files :**
- Modify : `desktop/src/utils.ts` (`equityBuckets`), `desktop/src/components/ResultCompare.vue`

- [ ] **Step 1 :** `export const equityBuckets = (equity: number[], normalizer: number[]): number[]` — renvoie 4 parts (ordre ≥ 90, 75-90, 50-75, < 50) dont la somme vaut 1 ; `[NaN, NaN, NaN, NaN]` si la somme des poids est nulle.
- [ ] **Step 2 :** `ResultCompare.vue` : `buckets` calculé pour chaque joueur (NaN si `results.isEmpty`) ; quatre lignes « ≥ 90 % », « 75-90 % », « 50-75 % », « < 50 % » sous la ligne EQR, au même format (composant `Percentage` à gauche et à droite, `BarChart` entre les deux, valeur la plus forte en gras) ; ligne de synthèse « Nut advantage: OOP|IP (x% vs y% ≥ 90%) » ou « — ».
- [ ] **Step 3 : Vérifier** `pnpm build && pnpm lint && pnpm exec vue-tsc --noEmit` → vert.
- [ ] **Step 4 : Vérifier dans l'app** (instance de test CDP comme aux chantiers précédents) : sur un spot résolu, à la racine, les parts affichées correspondent au calcul fait sur `game_get_results` (équité et poids) à 0,1 point près ; sur un nœud terminal, pas d'erreur.
- [ ] **Step 5 : Commit** `feat: show range and nut advantage in Compare`, push, PR vers `dev`, CI verte.
