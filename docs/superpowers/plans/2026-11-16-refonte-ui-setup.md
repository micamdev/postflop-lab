# Refonte UI — PR 2 « Setup » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Setup sub-pages (OOP range, IP range, Board, Tree) by one Setup page: an explorer of saved ranges and tree configs on the left, both ranges in large editable grids in the centre, board / stacks / bet sizes / live memory estimate on the right.

**Architecture:** Pure logic (folder tree from the IndexedDB rows, search, JSON import/export, tree-config values, range text parsing, game-tree arguments) moves into small tested TS modules; the new Vue components only wire them. A new Rust command estimates the memory of the setup without touching the loaded game. Existing pages keep their logic: `TreeConfig.vue` becomes the "Edit tree" view, `RangeEditor.vue` stays for the bunching fold ranges.

**Tech Stack:** Vue 3.5, Pinia, Tailwind 3.4 (Graphite tokens), Reka UI, Vitest, Rust (Tauri 2 command + `cargo test`).

**Spec:** `docs/superpowers/specs/2026-11-16-refonte-interface-design.md` — sections « Setup (une page) », « Règles transverses », choices 6 (window / explorer collapse) and 7 (memory estimate). Mockup: `docs/superpowers/specs/ui-redesign/setup.html`.

## Global Constraints

- App text in English; commits without any Co-Authored-By line.
- No modal for Setup work: everything happens in the page (native confirm dialogs for destructive actions are fine).
- Graphite tokens only (`bg`, `panel`, `panel2`, `line`, `ink`, `muted`, `accent`, `cell`, `oop` `#5b8def`, `ip` `#e0a03c`); OOP = blue, IP = orange everywhere in Setup.
- One accent-coloured main action per screen: in Setup it is the top-bar Solve; Setup buttons are ghost (UiButton default) except the range panel's "Done".
- Saved data stays as today: IndexedDB `ranges` / `configurations`, groups `name0..name3` (4 levels), JSON export format `{version: 2, name, data: [{path, isGroup, value?}]}` — files exported before stay importable.
- Explorer collapses to an icon rail below 1500 px window width; minimum width 1280.
- The memory estimate never replaces or touches the game held in Rust; any Rust error is returned, never a panic (`panic = "abort"` in release).
- Never kill the user's dev app; test on vite port 5391 + CDP 9222 (`.superpowers/scratch/tauri-port.json`, `cdp.mjs`), stop with TaskStop on its own task. Remove any test data written to the user's IndexedDB or localStorage.

## Review Focus

1. Memory estimate on an incomplete or invalid setup (fewer than 3 cards, empty range, bad bet string, huge tree while typing): no estimate ("—" + reason), no crash, no freeze of the UI — Task 1 tests `estimate_rejects_*`.
2. Saving a range or tree under a name that already exists in the folder: asks before overwriting; cancel keeps the old one — Task 2 test `nameTaken` + Task 6 CDP.
3. Importing a JSON whose folder names collide with an existing item: refused with the message of today, nothing written — Task 2 test `itemsToAdd reports a group that collides with an item`.
4. Search with no match: "No match" shown; clearing the search restores the tree — Task 2 test `filterFolderTree with no match`.
5. A solution loaded from Library replaces ranges, board and bets: the Setup grids, board and bet table show them, and the range origin paths are cleared (they no longer describe the ranges) — Task 7 CDP.

---

### Task 1: Rust memory estimate without touching the game

**Files:**
- Modify: `desktop/src-tauri/src/solver.rs` (extract the config/tree building of `game_init` into `fn build_game_inputs(ranges: &[Range; 2], board: &[u8], args: &GameTreeArgs) -> Result<(CardConfig, ActionTree), String>`; `game_init` uses it; new command), `desktop/src-tauri/src/main.rs` (register), `desktop/src/invokes.ts`
- Create: `desktop/src/game-args.ts`, `desktop/src/game-args.test.ts`
- Modify: `desktop/src/solver-session.ts` (`buildTree` uses `gameTreeArgs`)

**Interfaces:**
- Rust: `#[derive(Deserialize)] #[serde(rename_all = "camelCase")] pub struct GameTreeArgs { board: Vec<u8>, starting_pot: i32, effective_stack: i32, rake_rate: f64, rake_cap: f64, donk_option: bool, oop_flop_bet, oop_flop_raise, oop_turn_bet, oop_turn_raise, oop_turn_donk, oop_river_bet, oop_river_raise, oop_river_donk, ip_flop_bet, ip_flop_raise, ip_turn_bet, ip_turn_raise, ip_river_bet, ip_river_raise: String, add_allin_threshold, force_allin_threshold, merging_threshold: f64, added_lines, removed_lines: String }`.
  - `game_init(range_state, game_state, cache_state, locks_state, args: GameTreeArgs) -> Option<String>` (same behaviour, now one argument).
  - `#[tauri::command(async)] game_memory_estimate(range_state, args: GameTreeArgs) -> Result<(u64, u64), String>` — builds a separate `PostFlopGame::with_config` from a clone of the ranges and returns `memory_usage()`; bet-size / tree errors become `Err` (no `unwrap`).
- TS: `export interface GameTreeArgs { board: number[]; startingPot: number; effectiveStack: number; rakeRate: number; rakeCap: number; donkOption: boolean; oopFlopBet: string; …; ipRiverRaise: string; addAllinThreshold: number; forceAllinThreshold: number; mergingThreshold: number; addedLines: string; removedLines: string }`; `gameTreeArgs(c: ConfigLike): GameTreeArgs` where `ConfigLike` = the config store's state fields (rakePercent → rakeRate /100, thresholds /100, bet strings through `convertBetString`, donk strings "" when `donkOption` is false); `invokes.gameInit(args: GameTreeArgs): Promise<string | null>`; `invokes.gameMemoryEstimate(args: GameTreeArgs): Promise<[number, number]>` (rejects with the Rust message).

- [ ] **Step 1: Rust tests (in `solver.rs` `#[cfg(test)]`)**: `estimate_matches_built_game` (small spot "AA,KK" vs "QQ,JJ", flop Td9d6h, bets "50%": estimate equals `memory_usage()` of the same game built with `update_config`, and raw > compressed > 0); `estimate_rejects_bad_bet_size` (`"50%, abc"` → `Err`, no panic); `estimate_rejects_empty_range` (`Err`); `estimate_rejects_short_board` (2 cards → `Err`).
- [ ] **Step 2: Run `cargo test -p postflop-lab estimate`** — Expected: FAIL (function missing).
- [ ] **Step 3: Implement** `GameTreeArgs`, `build_game_inputs`, `game_memory_estimate`; port `game_init` to it.
- [ ] **Step 4: Run `cargo test -p postflop-lab`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all --check`** — Expected: pass.
- [ ] **Step 5: TS test `game-args.test.ts`**: `gameTreeArgs` on a config with rake 5 %, cap 3, bets "33, 75" / raise "3x", donk off with donk strings set, thresholds 150/20/10 → `rakeRate 0.05`, `rakeCap 3`, `oopFlopBet` = `convertBetString("33, 75")`, donk strings `""`, thresholds 1.5/0.2/0.1; with donk on → donk strings converted. Run `pnpm test` (FAIL), implement, run (PASS).
- [ ] **Step 6: `solver-session.ts` and `invokes.ts` use `gameTreeArgs`**; `pnpm test`, `pnpm lint`, `vue-tsc` pass.
- [ ] **Step 7: Commit** `feat: memory estimate of the setup without building the game`.

### Task 2: Saved items as a folder tree (pure)

**Files:**
- Create: `desktop/src/saved-items.ts`, `desktop/src/saved-items.test.ts`
- Modify: `desktop/src/components/DbItemPicker.vue` (use `checkJsonItems`, `itemsToAdd`, `toJsonItems` from the module; behaviour unchanged)

**Interfaces:**
- Produces:
  ```ts
  export type SavedStore = "ranges" | "configurations";
  export type FolderNode = { kind: "folder"; name: string; path: string[]; children: SavedNode[] };
  export type ItemNode = { kind: "item"; name: string; path: string[]; value: unknown };
  export type SavedNode = FolderNode | ItemNode;
  export const rowPath = (row: DbItem | DbGroup): string[];
  export const buildFolderTree = (rows: (DbItem | DbGroup)[]): SavedNode[]; // folders first, then items, each sorted by name (localeCompare, numeric)
  export const filterFolderTree = (nodes: SavedNode[], query: string): SavedNode[]; // case-insensitive; an item matches by name; a folder matching by name keeps all its children; ancestors of matches kept
  export const nameTaken = (nodes: SavedNode[], folder: string[], name: string): "item" | "folder" | null;
  export const MAX_DEPTH = 4;
  export type JsonItem = { path: string[]; isGroup: boolean; value?: unknown };
  export const checkJsonItems = (store: SavedStore, data: unknown): data is JsonItem[];
  export const itemsToAdd = (store: SavedStore, data: JsonItem[], existing: (DbItem | DbGroup)[]): (DbItem | DbGroup)[] | string; // string = name of the colliding group
  export const toJsonItems = (nodes: SavedNode[]): JsonItem[];
  ```
  (`checkJson`, `getItemsToAdd` and `appendRecursive` move here from `DbItemPicker.vue`, made pure.)

- [ ] **Step 1: Write the failing tests:** `buildFolderTree` nests 4 levels and sorts ("SRP" folder before item "BTN open"; "BB10" after "BB9"); `filterFolderTree("bb")` keeps "100bb › SRP › BB vs BTN call" with its ancestors and drops "BTN open"; `filterFolderTree with no match` → `[]`; a folder named "3bet pots" matching "3bet" keeps all its children; `nameTaken` → "item" / "folder" / null; `checkJsonItems` accepts a ranges export of today (string values) and rejects object values for ranges, missing paths, depth > 4; `itemsToAdd` skips items already present, creates missing parents, and `itemsToAdd reports a group that collides with an item` (returns the group name); `toJsonItems(buildFolderTree(rows))` round-trips through `itemsToAdd(…, [])` to the same rows.
- [ ] **Step 2: Run `pnpm test`** — Expected: FAIL.
- [ ] **Step 3: Implement `saved-items.ts`; switch `DbItemPicker.vue` to it.**
- [ ] **Step 4: Run `pnpm test`, `pnpm lint`, `vue-tsc`** — Expected: pass.
- [ ] **Step 5: Commit** `feat: saved ranges and trees as a folder tree`.

### Task 3: Tree-config values and range text (pure)

**Files:**
- Create: `desktop/src/tree-config-value.ts`, `desktop/src/tree-config-value.test.ts`, `desktop/src/range-text.ts`, `desktop/src/range-text.test.ts`
- Modify: `desktop/src/components/TreeConfig.vue` (use the module for save/load), `desktop/src/components/RangeEditor.vue` (use `parseRangeText`)

**Interfaces:**
- `export type ConfigValue` (moved from TreeConfig.vue); `configToValue(config: ConfigLike): ConfigValue`; `applyConfigValue(config: ConfigLike, value: unknown): void` (today's `loadConfig` body: numbers via `Number`, bets sanitized when valid else kept raw).
- `parseRangeText(text: string): { ok: true; text: string } | { ok: false; error: string }` — today's `onRangeTextChange` pre-check (trim with `trimRegex`, split, drop trailing empty, `rangeRegex` per part, error "Failed to parse range: X" / "(empty string)").

- [ ] **Step 1: Failing tests:** config value round trip (`applyConfigValue(c, configToValue(c0))` gives c0's fields); a stored bet "50,abc" stays "50,abc" (invalid, kept raw) while "33,75" becomes the sanitized form; `parseRangeText("AA, KQs ,")` → ok "AA,KQs"; `parseRangeText("AA,ZZ")` → error "Failed to parse range: ZZ"; `parseRangeText("")` → ok "".
- [ ] **Step 2: `pnpm test`** — FAIL. **Step 3: implement, switch TreeConfig/RangeEditor.** **Step 4: `pnpm test`, lint, vue-tsc** — pass.
- [ ] **Step 5: Commit** `refactor: tree-config values and range text as tested modules`.

### Task 4: Range editing composable and origin of each range

**Files:**
- Create: `desktop/src/use-range-editing.ts`
- Modify: `desktop/src/components/RangeEditor.vue` (uses the composable; template unchanged), `desktop/src/store.ts`, `desktop/src/library.ts`

**Interfaces:**
- `useRangeEditing(player: number)` → `{ text: Ref<string>; error: Ref<string>; weight: Ref<number>; numCombos: Ref<number>; applyText(): Promise<void>; setCell(row, col, weight): Promise<void>; startPaint(row, col); paintOver(row, col); endPaint(); clear(): Promise<void>; invert(): Promise<void>; loadText(text: string): Promise<boolean> }` — today's RangeEditor logic (invokes `rangeUpdate`, `rangeFromString`, `rangeGetWeights`, `rangeToString`, `rangeNumCombos`, `rangeClear`, `rangeInvert`; `store.ranges` kept in sync; refresh on `solutionLoadCount`).
- Store: `rangeSources: [RangeSource | null, RangeSource | null]` with `type RangeSource = { path: string[]; modified: boolean }`; `treeSource: RangeSource | null`. `useRangeEditing` sets `modified = true` on any edit of players 0/1; `loadText` called from the explorer sets the source; `loadSolution` (library.ts) sets both range sources and `treeSource` to null.

- [ ] **Step 1: Move the logic; RangeEditor (bunching players 2–5) still works.**
- [ ] **Step 2: `pnpm test`, lint, vue-tsc** — pass.
- [ ] **Step 3: Commit** `refactor: range editing composable and range origins`.

### Task 5: The explorer

**Files:**
- Create: `desktop/src/components/setup/SavedExplorer.vue`, `desktop/src/components/setup/SavedTreeRow.vue` (recursive row), `desktop/src/use-window-width.ts`

**Interfaces:**
- Consumes: Task 2 module, `db.ts`, Task 4 (`loadText`, store sources), Task 3 (`applyConfigValue`, `configToValue`), `ask` from `library.ts`, UiMenu / UiButton / UiSegmented / UiTooltip.
- `SavedExplorer` (no props): tabs **Ranges | Trees** (UiSegmented); search input; tree from `buildFolderTree(await Db.getArray(store))` filtered by `filterFolderTree`; folders toggle open (all open while searching); click an item = select (highlight); selected range shows **→ OOP** / **→ IP** (loads it with `loadText` and sets `rangeSources[p] = {path, modified:false}`); selected tree shows **Load** (`applyConfigValue` + `treeSource`); OOP / IP / TREE tags on the rows matching the current sources (unmodified); drag an item (HTML5 `dataTransfer` `application/x-postflop-range` = JSON path) for the range panels; per-row ⋯ menu: Rename (inline input), Delete (confirm with `ask`, folder deletes its content as today); footer: **＋ Folder** (inline name, inside the selected folder, refuses depth > 4), **Save current** menu — Ranges tab: "OOP range" / "IP range", Trees tab: "Tree config" — inline name input saving into the selected folder; existing name → `ask("Overwrite …?")` → `Db.overwriteItem`; header ⋯ menu: Import JSON… / Export JSON… (dialog + `checkJsonItems` / `itemsToAdd` / `toJsonItems`, messages of today). After any DB change it posts `{type: "importJson"}` on `BroadcastChannel("item-picker-" + store)` so other pickers reload. Empty states: "No saved ranges yet — Save current…" / "No match".
- `useWindowWidth(): Ref<number>`; below 1500 the explorer renders as a 44 px rail with two icon buttons (Ranges, Trees) that expand it over the page; it collapses again on outside click.

- [ ] **Step 1: Build the component.** **Step 2: lint, vue-tsc, test** — pass.
- [ ] **Step 3: CDP check** (temporary entry in App to show it, or done with Task 6): create folder "zz test" > "SRP", save the OOP range in it, rename, search "zz", → IP, export JSON to the scratch dir, delete the folder; screenshots. Remove all test rows afterwards.
- [ ] **Step 4: Commit** `feat: saved ranges and trees explorer`.

### Task 6: The Setup page

**Files:**
- Create: `desktop/src/components/setup/SetupPage.vue`, `RangePanel.vue`, `BoardPanel.vue`, `StacksPanel.vue`, `BetSizesPanel.vue`, `MemoryEstimate.vue`
- Modify: `desktop/src/components/App.vue` (Setup = SetupPage; bunching and "Edit tree" views shown in the centre with "← Back to setup"), `desktop/src/store.ts` (`SideView = "main" | "tree-config" | "bunching"`, default "main"), `desktop/src/components/TreeConfig.vue` (its DbItemPicker removed: saving/loading trees is the explorer's job), `desktop/src/components/SolveSettingsPanel.vue` (bunching link unchanged target)
- Delete: `desktop/src/components/SetupNav.vue`, `desktop/src/components/BoardSelector.vue` (logic moves into BoardPanel)

**Interfaces:**
- `RangePanel` props `player: 0 | 1`: header (OOP/IP badge in player colour, origin path `a › b › name` + "(modified)", combos and % of all combos), 13×13 grid filled in the player colour by weight (cell bottom-filled for partial weight), **Edit** toggles editing (paint with mouse drag, text input + error, weight slider + number, Clear, Invert, **Done**); accepts the explorer drag (drop = `loadText` + source).
- `BoardPanel`: five slots (empty slots dashed), click opens a Reka Popover with the 52 `BoardSelectorCard`s; text input ("Ah Kd Qc" paste as today); **Random flop**; Clear; expected-board-length warning of today.
- `StacksPanel`: pot, effective stack (UiField inputs on `config`), SPR = stack / pot (1 decimal, "—" if pot ≤ 0).
- `BetSizesPanel`: table OOP bet / OOP raise / IP bet / IP raise × Flop / Turn / River, each a compact text input bound to `config.*`, sanitized on blur with `sanitizeBetString` (invalid input kept and outlined red, with the message as tooltip); donk row when `config.donkOption`; footer link **Edit tree ›** → `sideView = "tree-config"`; tree origin path from `treeSource`.
- `MemoryEstimate`: watches `gameTreeArgs(config)` and `store.ranges` (deep), debounced 600 ms, calls `gameMemoryEstimate`; shows "Memory ≈ 1.25 GB (32-bit) · 640 MB (16-bit) · 8.10 GB available · 8 threads" with `formatBytes`, the precision that `choosePrecision(settings.precision, …, ignoreMemoryLimit)` would use, red when it refuses; "—" + reason when `checkConfig` fails or the command rejects; ignores a stale reply (request id).
- `SetupPage`: `[SavedExplorer][RangePanel 0][RangePanel 1][right column 290 px: BoardPanel, StacksPanel, BetSizesPanel, MemoryEstimate]`, full height, each panel scrolls on its own.

- [ ] **Step 1: Build the components and wire App/store.** **Step 2: lint, vue-tsc, test** — pass.
- [ ] **Step 3: CDP check with screenshots at 1600 and 1300 px width:** load a saved range to OOP from the explorer, drag one to IP, edit a cell → "(modified)"; board via popover + text + random; bets edited, invalid bet outlined; memory estimate updates and goes red when tiny RAM is simulated (`ignoreMemoryLimit` off, very large tree); Edit tree › and back; Solve from the top bar still works; load a solution from Library → grids/board/bets updated and origin paths cleared (Review Focus 5). Remove test data.
- [ ] **Step 4: Commit** `feat: single-page Setup`.

### Task 7: PR

- [ ] **Step 1:** Push `feat/ui-setup`, open the PR to `dev` (summary, screenshots, deferred items for PR 3/4), wait for CI green.

## Rulings carried by this plan

- "Edit tree ›" shows the existing tree form (`TreeConfig.vue`, without its saved-config list) in the centre zone with "← Back to setup", rather than unfolding inside the narrow right column: the form (thresholds, added/removed lines, tree preview) does not fit in 290 px. Still no modal.
- Bet sizes are edited directly in the table (compact text inputs) instead of read-only chips: one click less, same look.
- `RangeEditor.vue` and `DbItemPicker.vue` stay for the bunching fold ranges (players 2–5) until PR 4.
