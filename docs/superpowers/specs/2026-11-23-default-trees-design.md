# Default trees

## Intent

Someone new to the app does not know what to type in the 14 bet size fields. The sizes we
measured with the app's own solver (sizing lab, November 2026: a small size plus a big one,
per street, pot type and position) are a good starting point. Ship them as ordinary saved trees.

## Decisions (approved by the user)

- A **"Default" folder in the Trees tab** with six trees: "SRP, opener IP", "SRP, opener IP
  (simplified)", "3-bet pot, 3-bettor OOP", "3-bet pot, 3-bettor OOP (simplified)",
  "3-bet pot, 3-bettor IP", "3-bet pot, 3-bettor IP (simplified)". No 4-bet pot (not measured).
- They are **ordinary trees**: load, edit, rename, delete as any other.
- **Added once**, the first time a version that ships them runs (a seed version kept in
  localStorage). A tree already at the same path is left alone. Deleted trees do not come back.
  A later version can add new trees by raising the seed version (only missing ones are added).
- **Rake: NL50** (5%, cap 60 in app units) in the six trees and in the new Setup default.
- **The default Setup** takes the sizes of "SRP, opener IP (simplified)" (and its rake).
- **No recommendation button** (the app ships no spots).

## Sizes (app units: % of the pot; raises in % or "x")

| Tree | IP bets (flop / turn / river) | OOP bets | Raises | Donk (turn / river) | Pot / stack |
|---|---|---|---|---|---|
| SRP, opener IP | 33, 75 / 75, 150 / 75, 150 | — / 33, 150 / 33, 150 | IP 60, OOP 4x; turn+river 60 | 33 / 33, 150 | 55 / 975 |
| … (simplified) | 33, 75 / 75 / 75, 150 | — / 33, 150 / 33, 150 | IP 60, OOP 4x; none later | 33 / 33 | 55 / 975 |
| 3-bet pot, 3-bettor OOP | 33 / 33, 100 / 33, 125 | 25, 60 / 25, 115 / 33, 125 | OOP 60, IP 3x; later 60 | — | 275 / 865 |
| … (simplified) | 33 / 33 / 33, 125 | 33 / 25, 115 / 33, 125 | OOP 60, IP 3x; none later | — | 275 / 865 |
| 3-bet pot, 3-bettor IP | 25, 60 / 33, 100 / 33, 125 | 33 / 33, 150 / 33, 150 | IP 60, OOP 2.5x; later 60 | 33 / 33, 150 | 175 / 920 |
| … (simplified) | 25, 60 / 33, 100 / 33, 125 | — / 33, 150 / 33, 150 | IP 60, OOP 2.5x; none later | 33 / 33 | 175 / 920 |

## Plan

1. `desktop/src/default-trees.ts`: `DEFAULT_TREES` (path + `ConfigValue`), `DEFAULT_TREES_VERSION = 1`,
   pure `defaultTreeRows(existing: Row[]): Row[]` (folder if missing, trees whose path is absent),
   `seedDefaultTrees(storage)` (reads/writes the version key, adds the rows with `Db.bulkAdd`;
   a failure leaves the key unset so it retries next time). Tests: every size valid, the value
   shape is a saved tree's (`configToValue` keys), rows for an empty / partial / modified library,
   version gate.
2. `SavedExplorer.vue`: seed before the first load.
3. `store.ts` defaults = the simplified SRP tree; `store-defaults.test.ts` updated first.
4. Checks, dev-app check (folder present, loads), review, PR to `dev`.
