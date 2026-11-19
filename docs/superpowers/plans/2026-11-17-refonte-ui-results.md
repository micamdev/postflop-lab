# Refonte UI — PR 3 « Results » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Results view in the Graphite style: compact node cards with action percentages, a toolbar (Strategy | Equity | Compare + Turn/River), a full-width node strategy bar, conventional action colours, Compare layout B, the restyled lock editor, and "Re-solve with locks" as the top-bar main action when locks are pending.

**Architecture:** Keep the existing Results components and their data flow (ResultViewer ← ResultNav `trigger-update`, hover / scroll protocols, storage keys, watchers); change their templates and styles, and move the decisions they share into tested modules: action colours, node strategy frequencies, pending locks, and the locked re-solve flow (now callable from both the lock editor and the top bar). Results leaves the `.legacy` CSS scope.

**Tech Stack:** Vue 3.5, Pinia, Tailwind 3.4 (Graphite tokens), Reka UI, chart.js (vue-chartjs), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-refonte-interface-design.md` — sections « Results », « Règles transverses », choices 2, 3 and 5. Mockups: `docs/superpowers/specs/ui-redesign/direction.html` (direction B, Graphite) and `compare.html` (layout B).

## Global Constraints

- App text in English; commits without any Co-Authored-By line.
- Graphite tokens only (`bg`, `panel`, `panel2`, `line`, `ink`, `muted`, `accent`, `cell`, `oop` `#5b8def`, `ip` `#e0a03c`); OOP / IP colours identify players, never actions.
- Action colours (spec): check / call green `#3fae6e`, bets and raises in reds getting darker with size (`#e0704f` → `#c4473a` → `#9e2f2b`), all-in the darkest `#7a1f1c`, fold blue `#4f86c6`.
- Tabs: Strategy | Equity | Compare, plus the Turn / River tab that appears when a card-dealing node is selected (choice 3). No "Ranges" tab.
- Compare keeps all its options (display Strategy / EV / EQR / EQ, bar height, suits) (choice 5).
- One accent main action per screen (top bar); toolbar buttons are ghost.
- Nothing existing is lost: river picker and river re-solve, card arrows and undeal, hover → table filter, Equity tooltip → table scroll, CSV export, table sort and virtual scroll, storage keys (`display-options`, `display-options-table-*`, `sort-key-table-*`), `returnLine` replay, chance auto-tab.
- Test the app on vite 5391 + CDP 9222 with `CARGO_TARGET_DIR=.superpowers/target-test` and `WEBVIEW2_USER_DATA_FOLDER=.superpowers/webview-test` (the user's app may be open); stop with TaskStop on its own task.

## Review Focus

1. A node where the acting player has no hand left (empty range after the line): no strategy bar values, no NaN, the "no hands" message — Task 2 test `nodeStrategy is null without hands`.
2. Many bet sizes (6 actions incl. all-in) and raise nodes: colours stay distinct and ordered by size, all-in darkest — Task 1 tests.
3. Locks deleted in the editor so the list differs from the solution's (even when now empty): counts as pending, the top bar offers "Re-solve with locks" — Task 2 test `hasPendingLocks when a lock was removed`.
4. Chance node selected (turn/river card picker): no strategy bar, Turn/River tab active, Equity/Compare still usable after dealing — Task 4 CDP.
5. "Re-solve with locks" from the top bar on an unsaved solution: Save first / Re-solve without saving / Cancel as in the editor; Cancel does nothing — Task 3 test `cancel keeps the solution` + Task 4 CDP (native dialog checked by the user).

---

### Task 1: Action colours

**Files:**
- Create: `desktop/src/action-colors.ts`, `desktop/src/action-colors.test.ts`
- Modify: `desktop/src/components/ResultNav.vue` (its local `actionColor` and palette replaced by the module)

**Interfaces:**
- Produces: `export const ACTION_COLORS = { check: "#3fae6e", fold: "#4f86c6", betSmall: "#e0704f", betMid: "#c4473a", betLarge: "#9e2f2b", allIn: "#7a1f1c" }`; `actionColor(name: string, betRank: number, numBets: number): string` where `name` is the engine action name ("Fold", "Check", "Call", "Bet", "Raise", "AllIn"), `betRank` the 0-based position of this bet/raise among the node's bet/raise actions ordered by amount, `numBets` their count (all-in excluded): one bet → `betSmall`; two → `betSmall`, `betLarge`; more → interpolated from `betSmall` through `betMid` to `betLarge`.
- [ ] **Step 1: Failing tests:** fold/check/call/all-in exact colours; one bet = `#e0704f`; two bets = small then large; five bets give five distinct colours, each darker (lower luminance) than the previous; the middle of three is `#c4473a`.
- [ ] **Step 2: `pnpm test`** — FAIL. **Step 3: implement; ResultNav uses it** (bets ranked by amount as today's code orders them). **Step 4: `pnpm test`, lint, vue-tsc** — pass.
- [ ] **Step 5: Commit** `feat: conventional action colours`.

### Task 2: Node strategy and pending locks (pure)

**Files:**
- Create: `desktop/src/node-strategy.ts`, `desktop/src/node-strategy.test.ts`
- Modify: `desktop/src/lock-utils.ts` (+ `hasPendingLocks`), create `desktop/src/lock-utils.test.ts` (move `.superpowers/scratch/mirror.test.mts` cases into it), `desktop/src/components/ResultNav.vue` (its `rates` computed through `nodeStrategy`)

**Interfaces:**
- `nodeStrategy(strategy: number[], normalizer: number[], actions: { name: string; amount: string; color: string }[]): { name: string; amount: string; color: string; frequency: number }[] | null` — per action `i`, `average(strategy.slice(i*n, (i+1)*n), normalizer)` with `n = normalizer.length`; `null` when `n === 0` or the normalizer sums to 0.
- `hasPendingLocks(locks: NodeLock[], solutionLocks: NodeLock[]): boolean` — true when the two lists differ as sets keyed by `key` with equal content (`hands`, `edited`, `actions`), order ignored.
- [ ] **Step 1: Failing tests:** two actions over three hands with weights `[1, 1, 2]` give the weighted frequencies (sum 1); `nodeStrategy is null without hands` (`normalizer = []` and `[0, 0]`); `hasPendingLocks` false for the same locks in another order, true when a lock was added, `hasPendingLocks when a lock was removed` (solution has one, editor list empty → true), true when a lock's hands changed; the mirror tests pass from Vitest.
- [ ] **Step 2: `pnpm test`** — FAIL. **Step 3: implement; ResultNav's `rates` uses `nodeStrategy`.** **Step 4: `pnpm test`, lint, vue-tsc** — pass.
- [ ] **Step 5: Commit** `feat: node strategy frequencies and pending locks as tested modules`.

### Task 3: Re-solve with locks from the lock editor or the top bar

**Files:**
- Create: `desktop/src/lock-resolve.ts`, `desktop/src/lock-resolve.test.ts`
- Modify: `desktop/src/solve-status.ts` (+ action `"resolve-locks"`), `solve-status.test.ts`, `desktop/src/store.ts` (`currentLine: { history: number[]; label: string } | null`, `isSaveDialogOpen: boolean`), `desktop/src/components/TopBar.vue` (SaveSolutionDialog driven by `store.isSaveDialogOpen`; main action "resolve-locks" → `startLockedResolve(store.currentLine)`), `desktop/src/components/NodeLockEditor.vue` (its `resolveWithLocks` / `startResolve` / save-dialog code replaced by the module), `desktop/src/components/ResultViewer.vue` (sets `store.currentLine` on every `trigger-update`)

**Interfaces:**
- `primaryAction(f: SolveFlags, canSave: boolean, pendingLocks = false): PrimaryAction` — `"resolve-locks"` when finished, not solving, and `pendingLocks`; it wins over `"save"` (the flow offers to save first).
- `useLockResolve()` (Pinia setup store): `isBusy: Ref<boolean>`, `error: Ref<string>`, `start(line: {history: number[]; label: string}): Promise<void>` — the editor's current flow: `choose("The current solution is not saved and re-solving replaces it. Save it first?", {yes: "Save first", no: "Re-solve without saving", cancel: "Cancel"})` when unsaved and savable; "Save first" sets `store.isSaveDialogOpen = true` and remembers the line, and `onSaveDialogClosed()` continues only if the solution is now saved; then `gamePrepareLockSolve(locks)`, solver flags, `solutionLocks`, `returnLine`, `useSolverSession().runLockedSolve(compression)` exactly as `NodeLockEditor.startResolve` does today. `onSaveDialogClosed(): Promise<void>`.
- [ ] **Step 1: Failing tests** (Tauri and dialog mocked as in `solver-session.test.ts`): `primaryAction` gives "resolve-locks" with pending locks on a finished solution (also when unsaved), never while solving; `start` on a saved solution calls `gamePrepareLockSolve` with the locks and then `runLockedSolve(compression)`, sets `returnLine` to the line; `cancel keeps the solution` (choose → "Cancel": no prepare, flags unchanged); "Save first" opens the dialog and prepares only after `onSaveDialogClosed` with `isSolutionSaved = true`; a prepare error sets `error` and leaves `isSolverFinished` true.
- [ ] **Step 2: `pnpm test`** — FAIL. **Step 3: implement; wire TopBar, NodeLockEditor, ResultViewer.** **Step 4: `pnpm test`, lint, vue-tsc** — pass.
- [ ] **Step 5: Commit** `feat: re-solve with locks from the top bar`.

### Task 4: Node cards, toolbar and strategy bar

**Files:**
- Create: `desktop/src/components/results/NodeStrategyBar.vue`, `desktop/src/components/results/ResultsToolbar.vue` (replaces ResultMiddle.vue)
- Modify: `desktop/src/components/ResultNav.vue` (template/styles), `desktop/src/components/ResultViewer.vue` (layout, toolbar, bar, lock button), `desktop/src/components/RiverPicker.vue`
- Delete: `desktop/src/components/ResultMiddle.vue`

**Interfaces:**
- `NodeStrategyBar` props `items: ReturnType<typeof nodeStrategy>` — full-width 22 px stacked bar, each segment `{name amount} {pct}%` in white when ≥ 8 % wide; hidden when `items` is null.
- `ResultsToolbar`: same props / emits / localStorage `display-options` as ResultMiddle (values unchanged); tabs as UiSegmented labelled **Strategy** (`basics`), **Equity** (`graphs`), **Compare** (`compare`) and the Turn / River tab (`chance`) shown only when `chanceMode !== ""` (same auto-switch); options as compact controls on the right: Player UiSegmented Auto (OOP/IP) / OOP / IP; Bar height UiSegmented Normalized / Absolute / Full; Suit UiSegmented Grouped / Suits; Display a `select.ui-input` (7 entries of today); Equity tab: EQ / EV / EQR UiSegmented; chance tab: chart select (5 entries). Slot `actions` for the lock button.
- ResultNav cards: height ≈ 120 px instead of 168, `rounded-lg border` `bg-panel`, current spot `border-accent ring-1 ring-accent`, current chance `border-ip`; header = player (OOP / IP / TURN / RIVER) + pot/stack in muted; action rows = 8 px colour dot (on every card), name + amount, percentage right-aligned in muted tabular numbers, chosen action `bg-panel2`; chance arrows, undeal, "Pick a river" / "Not saved" / "re-solved ≈" kept; resolve status and nav error lines restyled.
- ResultViewer: [ResultNav strip] [ResultsToolbar with 🔒 Lock node (UiButton ghost, badge = `store.locks.length` when > 0, disabled + tooltip `unlockableReason`)] [NodeStrategyBar when a player spot is selected and the table is not in chance mode] [content]. The "not solved" state shows a centred empty state ("No solution yet — set up a spot and press Solve, or open one from the Library").
- [ ] **Step 1: Build.** **Step 2: lint, vue-tsc, test** — pass.
- [ ] **Step 3: CDP** (load "Jh 9d 4c"): cards, strategy bar values equal to the card percentages, tab labels, options persist across a reload, deal a turn → Turn tab, river beyond depth → picker → re-solve still works; screenshots.
- [ ] **Step 4: Commit** `feat: compact node cards, toolbar and node strategy bar`.

### Task 5: Grid, table, Compare B, Equity, chance view and lock editor in Graphite

**Files:**
- Modify: `ResultBasics.vue` (cells `bg-cell`, diagonal `bg-panel2`, outline of the clicked cell in accent), `ResultTable.vue` (header/rows/hover/sort/scroll target in tokens; export button ghost), `ResultCompare.vue` (layout B column: rows "OOP value | label | IP value" with a split bar in `oop` / `ip`, then the four equity buckets face to face, nut advantage ★), `ResultViewer.vue` (compare = OOP grid | IP grid | 280 px column), `ResultGraphs.vue` and `ResultChance.vue` (OOP `#5b8def` / IP `#e0a03c` lines, legend, grid and title colours for a dark background), `NodeLockEditor.vue` (Graphite: UiButton, tokens, grid cells as in RangePanel), `desktop/src/components/App.vue` (Results container without `.legacy`)

- [ ] **Step 1: Restyle.** **Step 2: `grep -nE "text-gray|bg-gray|border-gray|bg-blue-1|button-(base|blue|red|green)|rgba\\(0, ?0, ?0" src/components/Result*.vue src/components/NodeLockEditor.vue src/components/RiverPicker.vue`** — Expected: no match. **Step 3: lint, vue-tsc, test** — pass.
- [ ] **Step 4: CDP:** Strategy hover filters the table and click freezes it; CSV export dialog opens; Equity tooltip scrolls the table; Compare B with all options; lock a hand at a node, "Re-solve with locks" from the top bar (saved solution → no dialog) ends on the node; screenshots at 1600 and 1300 px.
- [ ] **Step 5: Commit** `feat: Results in Graphite with Compare layout B`.

### Task 6: PR

- [ ] **Step 1:** Push `feat/ui-results`, open the PR to `dev` (based on PR #24 if it is not merged yet), CI green.

## Rulings carried by this plan

- Results components are restyled in place rather than rewritten: their data flow and storage keys are what must not break.
- Display stays a select (7 entries do not fit a segmented control).
- "Re-solve with locks" wins over "Save" as top-bar main action: its flow already offers to save first.
