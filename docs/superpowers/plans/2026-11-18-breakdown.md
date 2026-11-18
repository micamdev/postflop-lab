# Breakdown and filters: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Breakdown mode to Results. A table shows the hand categories, draws and equity buckets of the displayed player, using GTO Wizard's names. Clicking rows filters the grid and the strategy cards.

**Architecture:**
- Two pure TypeScript modules, both tested with Vitest:
  - `hand-category.ts` classifies a combo from card ids;
  - `breakdown.ts` aggregates per category and builds a filtered copy of `Results`.
- One component, `results/BreakdownTable.vue`.
- `ResultViewer` lays out the grid, the cards and the table for the new display mode `"breakdown"`.

**Tech Stack:** Vue 3.5, TypeScript, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-breakdown-design.md`

## Global Constraints

- Card id: `rank = id >>> 2` (0 = deuce … 12 = ace), `suit = id & 3`. A private hand is packed `card1 | card2 << 8` (see `ResultTable.vue:543`).
- `Results.weights/normalizer/equity/ev[player][h]` are indexed like `cards[player][h]` (`gamePrivateCards`).
- Names are exactly as in the spec. All UI text is in English.
- No change to the engine, the Rust side or the stores. Strategy, Equity, Compare, lock and chance mode keep their behaviour.
- Commits carry no Co-Authored-By line.

## Review Focus

- **Paired boards:** on K‑K‑4, A4 = Second pair, 88 = Second pair, K4 = Fullhouse, Kx = Trips. Pinned by tests in Task 1.
- **Hands that only play the board** (a straight or flush board that the hand does not improve): No made hand or Ace high. Pinned by a test in Task 1.
- **Wheel straights and wheel draws** (A‑2‑3‑4‑5): the ace counts low. Pinned by a test in Task 1.
- **A filter whose result is empty**, or a player with no hands: grid empty, cards show "No hands", no crash. Pinned by a test in Task 2 and a CDP check in Task 3.
- **Changing node, player or dealt card resets the filter.** CDP check in Task 3.

---

### Task 1: Hand classification

**Files:** Create `desktop/src/hand-category.ts` and `desktop/src/hand-category.test.ts`.

**Interfaces:**
- Produces:
  - `type HandCategory = "Straight flush" | "Quads" | "Fullhouse" | "Flush" | "Straight" | "Set" | "Trips" | "Two pair" | "Overpair" | "Top pair" | "Second pair" | "Third pair" | "Underpair" | "Ace high" | "No made hand"`
  - `type DrawCategory = "Flush draw" | "OESD" | "Gutshot" | "BDFD 2 cards" | "BDFD 1 card" | "BDSD" | "No draw"`
  - `type EquityBucket = "Best hands" | "Good hands" | "Weak hands" | "Trash hands"`
  - `type EquityRange = "Equity 90-100" | "Equity 80-90" | "Equity 70-80" | "Equity 60-70" | "Equity 50-60" | "Equity 25-50" | "Equity 0-25"`
  - `HAND_CATEGORIES`, `DRAW_CATEGORIES`, `EQUITY_BUCKETS`, `EQUITY_RANGES`: readonly arrays in display order (the order above).
  - `handCategory(hole: [number, number], board: number[]): HandCategory`
  - `drawCategory(hole: [number, number], board: number[]): DrawCategory` (board of 3 or 4 cards; with 5 cards it returns "No draw")
  - `equityBucket(equity: number): EquityBucket` (≥ 0.75 Best, ≥ 0.5 Good, ≥ 0.33 Weak, else Trash)
  - `equityRange(equity: number): EquityRange` (lower bound inclusive; 1.0 is in 90-100)
  - test helper used in tests only: `cards("AhKd")` parses a card string. Put it in the test file.

- [ ] **Step 1:** Write the failing tests in `hand-category.test.ts`, one `test` per line below. Notation `hole | board`.
  - **Pairs (K‑9‑4 rainbow, `Kh9d4c`):**
    - AsKs Top pair;
    - Qs9s Second pair;
    - 5s4s Third pair;
    - QsQd Second pair;
    - 7s7d Third pair;
    - 3s3d Underpair;
    - AsAd Overpair;
    - 9s9h Set;
    - Ks9s Two pair;
    - AsQd Ace high;
    - QsJd No made hand.
  - **Paired board (`KhKd4c`):**
    - As4s Second pair;
    - 8s8d Second pair;
    - 2s2d Underpair;
    - AsAd Overpair;
    - KsQs Trips;
    - Ks4s Fullhouse;
    - 4s4d Fullhouse;
    - QsJs No made hand.
  - **Board plays (`9h8d7c6s5h`):**
    - AsKd Ace high;
    - QsJd No made hand;
    - Ts2d Straight.
  - **Flush board (`AhKh7h4h2h`):**
    - 3s3d Third pair (the 3 sits between the 4 and the 2 of the board);
    - QhJd Flush;
    - QsJs No made hand (the board flush plays, no ace in hand).
  - **Wheel (`Ah4d3c`):** 2s5d Straight.
  - **Straight flush:** `9h8h7h` + ThJh Straight flush.
  - **Quads:** `KhKd4c` + KsKc Quads.
  - **Draws:**
    - `Kh9h4c`: AhQh Flush draw;
    - `Kh9d4c`: QsJs Gutshot (needs T);
    - `Th9d2c`: 8s7s OESD;
    - `Th9d2c`: QsJs OESD;
    - `Kh9d4c`: AsJd BDSD (Q + T make A‑K‑Q‑J‑T);
    - `Kh9d4c`: As3s BDSD (no spade on the board, so no BDFD; 2 + 5 make the wheel);
    - `Kh9d4s`: As3s BDFD 2 cards;
    - `Kh9h4c`: AhQd BDFD 1 card;
    - `5h4d2c`: As3d (wheel made) No draw;
    - a 5-card board gives No draw.
  - **Buckets:**
    - `equityBucket`: 0.75 Best, 0.5 Good, 0.33 Weak, 0.3299 Trash;
    - `equityRange`: 1 → "Equity 90-100", 0.25 → "Equity 25-50", 0.2499 → "Equity 0-25".
- [ ] **Step 2:** Run `pnpm test hand-category`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `hand-category.ts`.
  - **Evaluator:** `handValue(cards: number[]): number` for 1 to 7 cards, comparable across hand sizes. Category × 16⁵, plus kickers. Categories:
    - high card;
    - pair;
    - two pair;
    - trips;
    - straight;
    - flush;
    - full house;
    - quads;
    - straight flush.

    Straights and flushes need 5 cards. The ace is low for A‑5.
  - **Rule 1 (made hands):** `class(hole ∪ board)` with the value of hole+board strictly greater than the value of the board alone, and category ≥ straight, or quads/full house. Then apply the spec rules 2–9 in order, on the distinct board ranks, ignoring the board's own pairs.
  - **Draws:** flush and straight outs per the spec.
    - A straight-out rank `r` counts if `hole ∪ board ∪ {r}` contains a straight that `board ∪ {r}` does not.
    - 1 out rank = Gutshot, ≥ 2 = OESD.
    - Skip straight draws if the hand already has a straight using a hole card.
    - BDSD: some pair of ranks makes such a straight.
- [ ] **Step 4:** Run `pnpm test hand-category`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: hand, draw and equity categories of a combo`.

### Task 2: Aggregation and filtered results

**Files:** Create `desktop/src/breakdown.ts` and `desktop/src/breakdown.test.ts`.

**Interfaces:**
- Consumes: Task 1 exports; `Results` from `result-types.ts`.
- Produces:
  - `type BreakdownGroup = "hands" | "draws" | "buckets" | "ranges"`
  - `type BreakdownRow = { group: BreakdownGroup; name: string; combos: number; rangeShare: number; equity: number; ev: number; strategy: number[] | null }`
    - `strategy`: per-action frequency weighted by the normalizer, or null when `actingPlayer !== player`.
  - `categorize(cards: number[], board: number[]): { hand: HandCategory; draw: DrawCategory; bucket?: never }[]`: per combo (index aligned with `cards`).
  - `breakdownRows(results: Results, cards: number[], board: number[], player: 0 | 1, acting: boolean): BreakdownRow[]`
    - Rows of every group in display order, rows under 0.05 combos removed.
    - The `draws` group is empty when `board.length === 5`.
    - `combos` = Σ weights.
    - `rangeShare` = combos / Σ all weights.
    - `equity` and `ev` = normalizer-weighted means.
  - `type BreakdownFilter = Partial<Record<BreakdownGroup, string[]>>`
  - `comboMask(results: Results, cards: number[], board: number[], player: 0 | 1, filter: BreakdownFilter): boolean[]`: union inside a group, intersection across non-empty groups. An empty filter keeps every combo.
  - `filterResults(results: Results, player: 0 | 1, mask: boolean[]): Results`
    - A copy whose `weights[player]` and `normalizer[player]` are 0 where the mask is false.
    - Sets the player's `isEmpty` bit when nothing remains.
    - The other fields are shared.

- [ ] **Step 1:** Write the failing tests.
  - Setup: a 3-combo player on board `Kh9d4c`:
    - AsKs (Top pair, weight 1, equity 0.8);
    - QsJs (No made hand + Gutshot, weight 0.5, equity 0.3);
    - 9s9h (Set, weight 1, equity 0.95).
  - Tests:
    - `breakdownRows` gives Top pair combos 1 and rangeShare 0.4 (1 / 2.5);
    - Gutshot row combos 0.5;
    - strategy null when `acting` is false;
    - with two actions and strategy `[1,0,1, 0,1,0]`, the Top pair strategy is `[1, 0]`;
    - draws group absent on a 5-card board;
    - `comboMask` with `{hands: ["Top pair","Set"]}` gives `[true,false,true]`; with `{hands:["Top pair"], draws:["Gutshot"]}` gives all false;
    - `filterResults` zeroes the excluded weights, sets the `isEmpty` bit when the mask is all false, and leaves the input unchanged.
- [ ] **Step 2:** Run `pnpm test breakdown`. Expected: FAIL.
- [ ] **Step 3:** Implement `breakdown.ts`.
- [ ] **Step 4:** Run `pnpm test breakdown`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: breakdown rows and category filter`.

### Task 3: Breakdown mode in Results

**Files:**
- Modify:
  - `desktop/src/result-types.ts` (`displayModeList` gains `"breakdown"` after `"compare"`);
  - `desktop/src/components/results/ResultsToolbar.vue` (tab `Breakdown`; the Player switch and the Bars/Suits switches are shown for `breakdown` as for `basics`);
  - `desktop/src/components/ResultViewer.vue` (layout, filter state, resets).
- Create: `desktop/src/components/results/BreakdownTable.vue`.

**Interfaces:**
- Consumes: Task 2 exports.
- `BreakdownTable` props: `{ rows: BreakdownRow[]; actions: { name: string; amount: string; color: string }[] | null; filter: BreakdownFilter; advanced: boolean }`. Emits `toggle(group, name)`, `clear()`, `update:advanced(boolean)`.

- [ ] **Step 1:** Add the mode and the tab. In `ResultViewer`:
  - `breakdownFilter = ref<BreakdownFilter>({})` and `breakdownAdvanced = ref(false)`;
  - `filteredResults = computed(...)`: `results` when the mode is not breakdown or the filter is empty, otherwise `filterResults(results, player, comboMask(...))`;
  - `strategyItems` reads `filteredResults` in breakdown mode;
  - a `watch` on `[selectedSpot, selectedChance, displayPlayerBasics, currentBoard]` resets the filter.
- [ ] **Step 2:** Lay out the breakdown mode like Strategy:
  - `ResultBasics` square (`BASICS_SIDE`) with `filteredResults`;
  - right column `flex-1 min-w-[380px] flex flex-col bg-panel border-l border-line`, holding `NodeStrategyCards` then `BreakdownTable` (`flex-1 min-h-0 overflow-y-auto`).
- [ ] **Step 3:** Build `BreakdownTable.vue`.
  - **Group header rows:** `HANDS`, `DRAWS`, `EQ BUCKETS` with a `Simple | Advanced` `UiSegmented` (size as in the toolbar). Shows `buckets` or `ranges` rows.
  - **Columns:** Category | Strategy (stacked bar, h-2.5, in action colours; hidden when `strategy` is null) | Range % (1 decimal) | Combos (1 decimal) | EQ % (1 decimal) | EV (2 decimals).
  - **Rows:** clicking toggles a row. Selected rows get `bg-accent/15`. A `Clear` button (`UiButton size="sm"`) in the table header shows while a filter is active.
- [ ] **Step 4:** Run `pnpm test`, `pnpm lint` and `pnpm build`. Expected: all pass.
- [ ] **Step 5:** CDP checks on "zz e2e locked":
  - the Breakdown tab shows the rows;
  - row combos add up to the Summary total per group;
  - clicking "Top pair" filters the grid and changes the cards;
  - adding a draw row intersects;
  - Clear restores;
  - a filter with no combos gives the empty grid and "No hands";
  - changing the node resets the filter;
  - Strategy, Equity and Compare are unchanged.
- [ ] **Step 6:** Commit `feat: breakdown mode with category filters`.
