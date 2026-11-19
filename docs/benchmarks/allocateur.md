# Benchmark allocateur (chantier 0)

Objectif : choisir l'allocateur de l'app sur Rust stable sans régresser par
rapport à l'existant (nightly + `custom-alloc`). Règle (spec du chantier 0) :
garder la meilleure option stable ; si aucune n'est à moins de ~10 % de (a),
on en rediscute.

## Spot et protocole

- Spot : celui de `engine/examples/basic.rs` (turn, Td9d6h Qc, 3 tailles de
  mise, pot 200, stack 900), sans compression (`allocate_memory(false)`).
- Mesure : 500 itérations de `solve_step`, chronométrées seules (construction
  de l'arbre, allocation et calcul d'exploitabilité exclus). 5 runs par
  exécution, médiane retenue. Code : `engine/benches/`.
- Chaque variante a été exécutée en **5 séries**, en faisant tourner l'ordre
  de passage (la machine est un portable qui throttle : l'ordre pèse autant
  que l'allocateur). Le chiffre retenu est la médiane des 5 médianes.

Commandes :

| Variante | Commande |
|---|---|
| (a) nightly + `custom-alloc` | `cargo +nightly bench -p postflop-solver --bench reference_spot --features custom-alloc` |
| (b) stable, allocateur système | `cargo bench -p postflop-solver --bench reference_spot` |
| (c) stable + mimalloc | `cargo bench -p postflop-solver --bench reference_spot_mimalloc` |
| (d) stable + `custom-alloc` sur `allocator-api2` | `cargo bench -p postflop-solver --bench reference_spot --features custom-alloc` |

(a) ne se rejoue plus tel quel depuis la branche : après le port, sa commande
compile le code porté. Pour (a), la lancer dans un worktree sur `a8b81f4`
(`git worktree add --detach <dossier> a8b81f4`).

Limites du protocole : un seul spot (turn, sans compression) ; (a) n'inclut
pas les flags `-Z build-std … panic_immediate_abort` du build de release
d'origine.

## Machine

- CPU : Intel Core i7-1165G7 (4 cœurs, 8 threads), 16 Go RAM, Windows 11, sur secteur
- rustc stable 1.100.0 ; nightly 1.102.0-nightly (2026-11-13)
- Date : 2026-11-15

## Résultats

### Campagne 1 : (a), (b), (c)

Médianes par série (ms) :

| Variante | S1 | S2 | S3 | S4 | S5 | **Médiane** | Écart vs (a) |
|---|---|---|---|---|---|---|---|
| (a) nightly + custom-alloc | 2533 | 2228 | 2459 | 2176 | 2493 | **2459** | — |
| (b) stable, système | 2441 | 2498 | 2455 | 2601 | 2480 | **2480** | +0,9 % |
| (c) stable + mimalloc | 2385 | 2236 | 2351 | 2323 | 2299 | **2323** | −5,5 % |
| (d) stable + custom-alloc (allocator-api2) | voir campagne 2 | | | | | | |

Exploitabilité finale identique pour toutes les variantes : 0,0710.

L'écart intra-série atteint ~20 % (throttling).

### Campagne 2 : (a), (c), (d)

Après le port de `custom-alloc` sur `allocator-api2`, (a) n'est plus
reproductible depuis la branche : il a été mesuré dans un worktree temporaire
sur le commit d'avant le port (`a8b81f4`). (a), (c) et (d) ont été intercalés
en 5 séries à ordre tournant.

| Variante | S1 | S2 | S3 | S4 | S5 | **Médiane** | Écart vs (a) |
|---|---|---|---|---|---|---|---|
| (a) nightly + custom-alloc | 2310 | 2326 | 2409 | 2416 | 2358 | **2358** | — |
| (c) stable + mimalloc | 2524 | 2514 | 2468 | 2424 | 2931 | **2514** | +6,6 % |
| (d) stable + custom-alloc (allocator-api2) | 2394 | 2348 | 2479 | 2819 | 2310 | **2394** | +1,5 % |

Exploitabilité finale identique : 0,0710.

### Lecture

mimalloc passe de −5,5 % (campagne 1) à +6,6 % (campagne 2) : sur cette
machine, le bruit est du même ordre que les écarts entre allocateurs. Toutes
les options stables restent dans ±7 % de (a), donc sous le seuil des 10 %, et
aucune ne se détache de façon reproductible.

## Décision

**Option retenue : (b), allocateur système sur Rust stable.**

- (b) est à +0,9 % de (a) et (d) à +1,5 %, mais le bruit entre campagnes
  atteint ~±6 % ((c) passe de −5,5 % à +6,6 %) : ces écarts ne sont pas
  significatifs. Toutes les options sont dans ±7 % de (a), sous les 10 % de
  la règle, et aucune ne bat (b) de façon reproductible.
- À performances égales, (b) est la plus simple : pas de dépendance en plus,
  pas d'allocateur `unsafe` sur le chemin chaud de l'app.
- Le port (d) reste dans le moteur : la feature `custom-alloc` compile et est
  testée sur stable. Si un spot plus gros (flop) montrait un écart, on
  l'activerait côté app en une ligne :
  `postflop-solver = { path = "../../engine", features = ["custom-alloc"] }`.

## Contrôle chantier 1 (mise à jour des dépendances Rust)

Après la montée de rayon 1.12, bincode 2.0.1, zstd 0.14, etc. (2026-11-15,
même machine), variante (b) :

- 3 exécutions seules : 2635, 2689, 2668 ms (médiane 2668, +7,6 % vs 2480).
  Hors de la marge de ±7 %, donc contrôle A/B ci-dessous.
- A/B intercalé avec le commit d'avant la mise à jour (`0fe55f6`), 4 séries :
  avant 2375, 2313, 2254, 2316 ms (médiane ≈ 2314) ; après 2289, 2316, 2270,
  2316 ms (médiane ≈ 2302).

Conclusion : aucune régression ; l'écart des exécutions seules venait de
l'état de la machine. Exploitabilité inchangée (0,0710).
