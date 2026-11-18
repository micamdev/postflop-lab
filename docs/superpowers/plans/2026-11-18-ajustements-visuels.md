# Visual adjustments: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the interface denser and calmer:
- smaller controls;
- a muted lavender accent;
- the node's strategy as compact cards above the Summary;
- a square grid;
- Compare with its statistics in the middle.

**Architecture:** Front-end changes only:
- Graphite tokens (`style.css`, `tailwind.config.cjs`);
- UI kit (`UiButton`, `UiSegmented`);
- results components (`ResultViewer`, `ResultTable`, `ResultGraphs`, `ResultBasics`), plus a new `NodeStrategyCards` component that replaces `NodeStrategyBar`;
- square sizing through CSS container units (`cqw`/`cqh`, supported by WebView2).

**Tech Stack:** Vue 3.5, Tailwind 3.4, Reka UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-ajustements-visuels-design.md`

## Global Constraints

- No change to the engine, the Rust side or the stores.
- No lost behaviour: hover, lock, Suits, Normalized/Absolute/Full, chance mode, Compare and Equity keep working.
- Accent `#7b72c0` (`--accent: 123 114 192`). Text/link variant `#a9a2dc` (`--accent-ink: 169 162 220`). Neutral selection `#3a3a40` (`--sel: 58 58 64`).
- `UiButton` md = `h-7 text-xs`, sm = `h-6 text-[11px]`, new lg = `h-8 text-sm` (the top bar's main actions only).
- `UiSegmented`: `px-2.5 py-0.5 text-xs`; the selected item is `bg-sel text-ink`.
- Minimum width 1280 px: the right panel keeps at least 380 px.
- Commits carry no Co-Authored-By line.

## Review Focus

- **Window at 1280×800:** the grid stays square and the Summary stays usable (≥ 380 px). Checked by a CDP screenshot in Task 3.
- **Node with no hands for the player:** the "No hands for this player at this node" message is still shown (now in the cards block). Checked by CDP in Task 2.
- **A node with 5 or more actions** (several bet sizes and all-in): the cards wrap instead of overflowing. Covered by `flex-wrap`, checked by a CDP screenshot in Task 2.
- **Lock editor open:** neither the cards nor the grid change it, since `NodeLockEditor` replaces the view. Checked by CDP in Task 2.
- **Chance mode** (a turn or river card selected): unchanged, with no cards. Checked by CDP in Task 3.

---

### Task 1: Tokens, accent and UI kit

**Files:**
- Modify:
  - `desktop/src/style.css` (`:root` tokens);
  - `desktop/tailwind.config.cjs` (colours `accent-ink`, `sel`);
  - `desktop/src/components/ui/UiButton.vue`;
  - `desktop/src/components/ui/UiSegmented.vue`;
  - `desktop/src/components/TopBar.vue` (`size="lg"` on the main action buttons: Solve, Save, Re-solve with locks);
  - every place where the accent is used as text on a dark background.

**Interfaces:**
- Produces:
  - the Tailwind classes `text-accent-ink` and `bg-sel`;
  - `UiButton` prop `size?: "sm" | "md" | "lg"`.

- [ ] **Step 1:** Change the tokens:
  - `--accent: 123 114 192`;
  - add `--accent-ink: 169 162 220` and `--sel: 58 58 64`;
  - add `"accent-ink": v("accent-ink")` and `sel: v("sel")` to Tailwind.
- [ ] **Step 2:** Resize `UiButton`:
  - sizes `sm: h-6 px-2 text-[11px]`, `md: h-7 px-3 text-xs`, `lg: h-8 px-3.5 text-sm`;
  - add `"lg"` to the `size` type.
- [ ] **Step 3:** Restyle `UiSegmented`:
  - items `px-2.5 py-0.5 text-xs`;
  - selected item `bg-sel text-ink`, no longer `bg-accent text-white`.
- [ ] **Step 4:** In `TopBar.vue`, put `size="lg"` on the 6 `UiButton` of the main actions (save / resolve-locks / solve branches).
- [ ] **Step 5:** Switch the accent text on dark backgrounds to `text-accent-ink`:
  - `AboutPage` link;
  - `BunchingEffect` text (keep its border on `border-accent`);
  - Lock badge in `ResultViewer`;
  - `BetSizesPanel`;
  - "Tree" tag in `SavedExplorer`;
  - `busy` status in `TopBar`.

  Accent backgrounds and borders do not change.
- [ ] **Step 6:** Run `pnpm test` and `pnpm build`. Expected: all tests pass and the build succeeds (vue-tsc passes).
- [ ] **Step 7:** Check visually with CDP screenshots of Setup, Results and Library:
  - selections in grey;
  - Solve in lavender;
  - buttons at 28 px.
- [ ] **Step 8:** Commit `feat: smaller controls and muted lavender accent`.

### Task 2: Node strategy as cards above the Summary

**Files:**
- Modify: `desktop/src/node-strategy.ts` (add `combos`), `desktop/src/node-strategy.test.ts`.
- Create: `desktop/src/components/results/NodeStrategyCards.vue`.
- Delete: `desktop/src/components/results/NodeStrategyBar.vue`.
- Modify:
  - `desktop/src/components/ResultTable.vue` (slot `top`, above the SUMMARY header);
  - `desktop/src/components/ResultGraphs.vue` (forwards a slot `table-top` to the `top` slot of its `ResultTable`);
  - `desktop/src/components/ResultViewer.vue` (removes the bar and fills the slots).

**Interfaces:**
- Produces: `StrategyItem` gains `combos: number`, the sum of `strategy[i*n + h] * normalizer[h]`.
- Produces: `NodeStrategyCards` props `{ items: StrategyItem[] | null; noHands: boolean }`.

- [ ] **Step 1: Failing test.** Add to `node-strategy.test.ts`:

```ts
test("combos per action are the weighted sum of the strategy", () => {
  const items = nodeStrategy([1, 0.5, 0, 0, 0.5, 1], [1, 1, 2], actions)!;
  expect(items[0].combos).toBeCloseTo(1.5);
  expect(items[1].combos).toBeCloseTo(2.5);
});
```

- [ ] **Step 2:** Run `pnpm test node-strategy`. Expected: FAIL (`combos` undefined).
- [ ] **Step 3:** Add `combos` to `nodeStrategy`.
- [ ] **Step 4:** Run `pnpm test node-strategy`. Expected: PASS.
- [ ] **Step 5:** Build `NodeStrategyCards.vue`.
  - Container `flex flex-wrap gap-1.5 p-2 border-b border-line`.
  - One card per action, `flex-1 min-w-[96px]`:
    - left border 3 px in `item.color`;
    - label (`Check` / `Bet 30`) in `text-xs text-muted`;
    - frequency `text-lg font-semibold tabular-nums` with 1 decimal place and `%`;
    - combos `text-[11px] text-muted` (`x.x combos`).
  - Under the cards, a 4 px rounded proportional bar (`h-1 w-full`, segments sized by `frequency` in `item.color`).
  - If `noHands` is true: show only `No hands for this player at this node.` in `text-xs text-muted`.
  - If `items` is null and `noHands` is false: render nothing.
- [ ] **Step 6:** Wire it in:
  - `ResultTable`: `<slot name="top" />` as the first child of the root.
  - `ResultGraphs`: `<template #top><slot name="table-top" /></template>` on its `ResultTable`.
  - `ResultViewer`:
    - remove `NodeStrategyBar` and the `noHandsAtNode` paragraph;
    - put `<NodeStrategyCards :items="strategyItems" :no-hands="noHandsAtNode" />` in the `#top` slot of `ResultTable` (Strategy mode) and the `#table-top` slot of `ResultGraphs` (Equity mode);
    - in Compare mode, put it at the top of the middle column (Task 3).
- [ ] **Step 7:** Run `pnpm test` and `pnpm build`. Expected: everything passes.
- [ ] **Step 8:** CDP check on "zz e2e locked" (Results):
  - cards Check 14.2% / Bet 30 85.8% above the Summary, with combos;
  - Equity mode shows the cards;
  - a node with no hands shows the message;
  - Lock node opens the editor without the cards.
- [ ] **Step 9:** Commit `feat: node strategy as compact cards above the summary`.

### Task 3: Square grid and Compare with its statistics in the middle

**Files:**
- Modify: `desktop/src/components/ResultViewer.vue` (results container and the Strategy and Compare layouts), `desktop/src/components/ResultCompare.vue` (no left border; a column now has borders on both sides).

- [ ] **Step 1:** Make the results container a size container: the `flex flex-grow min-h-0` div gets `[container-type:size]`.
- [ ] **Step 2:** Strategy mode:
  - `ResultBasics` gets `style="flex: none; width: min(100cqh, 100cqw - 380px); height: min(100cqh, 100cqw - 380px)"`;
  - `ResultTable` becomes `flex-1 min-w-[380px]`.
- [ ] **Step 3:** Compare mode:
  - order: OOP | middle column | IP;
  - middle column: `w-[240px] shrink-0 flex flex-col border-x border-line`, containing `NodeStrategyCards` then `ResultCompare` (`flex-1 min-h-0`);
  - each grid sits in a `flex-1 flex flex-col items-center` with an `OOP` label (`text-oop`) or `IP` label (`text-ip`), `text-[11px] font-bold tracking-wider`, above a square of side `min(100cqh - 24px, (100cqw - 240px) / 2)`.
- [ ] **Step 4:** Run `pnpm test` and `pnpm build`. Expected: everything passes.
- [ ] **Step 5:** CDP check at 1600×950 and 1280×800 (`Browser.setWindowBounds` or `Emulation.setDeviceMetricsOverride`):
  - square grid, Summary ≥ 380 px;
  - Compare: OOP | stats | IP, squares;
  - hovering a cell still updates the Summary;
  - chance mode unchanged.
- [ ] **Step 6:** Commit `feat: square range grid, compare statistics between the grids`.
