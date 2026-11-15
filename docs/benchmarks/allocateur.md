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

## Machine

- CPU : Intel Core i7-1165G7 (4 cœurs, 8 threads), 16 Go RAM, Windows 11, sur secteur
- rustc stable 1.100.0 ; nightly 1.102.0-nightly (2026-11-13)
- Date : 2026-11-15

## Résultats

Médianes par série (ms) :

| Variante | S1 | S2 | S3 | S4 | S5 | **Médiane** | Écart vs (a) |
|---|---|---|---|---|---|---|---|
| (a) nightly + custom-alloc | 2533 | 2228 | 2459 | 2176 | 2493 | **2459** | — |
| (b) stable, système | 2441 | 2498 | 2455 | 2601 | 2480 | **2480** | +0,9 % |
| (c) stable + mimalloc | 2385 | 2236 | 2351 | 2323 | 2299 | **2323** | −5,5 % |
| (d) stable + custom-alloc (allocator-api2) | à mesurer (Task 3) | | | | | | |

Exploitabilité finale identique pour toutes les variantes : 0,0710.

L'écart intra-série atteint ~20 % (throttling) : des écarts < 3 % entre
variantes sont à considérer comme équivalents.
