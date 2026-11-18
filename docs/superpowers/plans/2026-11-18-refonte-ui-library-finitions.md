# Refonte UI — PR 4 « Library et finitions » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the redesign: a Graphite Library (search, column sort, click to open, ⋯ menu), every remaining page in Graphite so the temporary `legacy.css` layer can be deleted, and the small defects left by PR 1–3.

**Architecture:** Library sorting and filtering become a tested pure module; the page keeps its Tauri calls. Form fields get Graphite base styles once in `style.css` (instead of the `.legacy` scope), then the remaining light classes are replaced file by file and `legacy.css` is removed.

**Tech Stack:** Vue 3.5, Pinia, Tailwind 3.4 (Graphite tokens), Reka UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-refonte-interface-design.md` — « Library », « Règles transverses », PR 4 of « Découpage ».

## Global Constraints

- App text in English; commits without any Co-Authored-By line.
- Nothing existing is lost (user's priority): Library load / rename / export / delete / import / open folder / unreadable entries, bunching fold ranges with their saved-range picker and precomputation, tree editor (preview, added / removed lines), save dialog depths.
- One accent main action per screen; others ghost or danger outline.
- Graphite tokens only; no `text-gray-*`, `bg-gray-*`, `border-gray-*`, `bg-blue-*`, `text-black`, `button-*` left in `desktop/src/components`.
- Test the app on vite 5391 + CDP 9222 with `CARGO_TARGET_DIR=.superpowers/target-test` and `WEBVIEW2_USER_DATA_FOLDER=.superpowers/webview-test`; stop with TaskStop on its own task.

## Review Focus

1. Library with unreadable files (no meta): still listed, sortable without crash (missing values sort last), Delete still offered — Task 1 tests `unreadable entries sort last` and `filter keeps unreadable entries matching by name`.
2. Search with accents / case / board text ("Jh9d"): matches name or board — Task 1 test `filterEntries matches name and board`.
3. Rename to an existing name: the existing message, nothing renamed — Task 2 CDP.
4. Bunching page after removing `.legacy`: fold-range editors, picker and buttons readable and working — Task 3 CDP.
5. Window at 1280 px: Results toolbar does not overflow (wraps or scrolls) — Task 4 CDP.

---

### Task 1: Library sort and filter (pure)

**Files:** Create `desktop/src/library-list.ts`, `desktop/src/library-list.test.ts`.

**Interfaces:**
- `type SortKey = "name" | "board" | "date" | "depth" | "exploitability" | "size"`; `sortEntries(entries: LibraryEntry[], key: SortKey, descending: boolean): LibraryEntry[]` (new array; natural name order; date by `created_at`; exploitability as % of pot; entries without `meta` always last); `filterEntries(entries, query: string): LibraryEntry[]` (case- and accent-insensitive on the name and on the board text like "Jh9d4c" / "Jh 9d 4c").
- [ ] **Step 1: Failing tests:** sort by name natural ("Spot 2" before "Spot 10"), by date both directions, by size; `unreadable entries sort last` in both directions; `filterEntries matches name and board` ("jh9D" and "Jh 9d" find board Jh9d4c, "srp" finds "BTN SRP"); `filter keeps unreadable entries matching by name`; empty query keeps all.
- [ ] **Step 2: `pnpm test`** — FAIL. **Step 3: implement.** **Step 4: `pnpm test`** — PASS. **Step 5: Commit** `feat: library sort and filter`.

### Task 2: Library page in Graphite

**Files:** Modify `desktop/src/components/LibraryPage.vue`, `desktop/src/components/App.vue` (Library without `.legacy`).

- Header: search input (`filterEntries`), then ghost **Import…**, **Open folder**, **Refresh**.
- Table: sortable headers (click toggles, arrow shows direction; default date descending) — Name, Board (suit chips), Date, Depth, Exploitability, Precision, Size; the row is clickable (opens the solution, disabled while the library is busy) except for unreadable entries; last column a `UiMenu` ⋯: Rename (inline input, Enter / Esc as today), Export…, Delete (danger). Unreadable rows: muted, "Unreadable: …", menu with Delete only. Current solution's row highlighted (`store.solutionInfo?.name`).
- Empty states: no solution ("No saved solutions yet — solve a spot, then Save in the top bar."), no match ("No match").
- [ ] **Step 1: Build.** **Step 2: lint, vue-tsc, test** — pass. **Step 3: CDP:** sort, search, open by row click, rename to an existing name (message, nothing changed), rename and back, export dialog opens; screenshots. **Step 4: Commit** `feat: Library in Graphite`.

### Task 3: Remaining pages in Graphite, legacy layer removed

**Files:** Modify `desktop/src/style.css` (base styles for `input[type=text|number|search]`, `select`, `textarea`, checkboxes and radios in Graphite; `.ui-input` moved here from `UiField.vue`; spinner colours from tokens), `TreeConfig.vue`, `TreeEditor.vue`, `BunchingEffect.vue`, `RangeEditor.vue`, `DbItemPicker.vue`, `SaveSolutionDialog.vue`, `RangeMiniViewer.vue`, `components/setup/SetupPage.vue` (no `.legacy`), `main.ts` (no legacy import). Delete `desktop/src/legacy.css`. Keep the `button-*` classes' remap in `style.css` only if a component still needs them after this task (expected: none — use UiButton).

- [ ] **Step 1: Restyle** (tokens; UiButton variants: the screen's main action primary, others ghost, destructive danger). **Step 2: `grep -rnE "text-gray|bg-gray|border-gray|bg-blue-|text-blue-|text-black|border-black|button-(base|blue|red|green)|legacy" desktop/src/components desktop/src/main.ts`** — Expected: no match. **Step 3: lint, vue-tsc, test** — pass.
- [ ] **Step 4: CDP:** Tree (Edit tree ›) with its preview / editor opened; Bunching page with a fold range edited and its picker; Save dialog; screenshots. **Step 5: Commit** `feat: remaining pages in Graphite, legacy layer removed`.

### Task 4: Deferred defects of PR 1–3

**Files:** `ResultViewer.vue` (orphan doc comment back above `unlockableReason`; `store.currentLine = null` in `clear()`; a muted "No hands for this player at this node." line where the strategy bar would be when the acting player has none), `NodeLockEditor.vue` (its "Re-solve with locks" ghost — the top bar holds the accent one; pending state through `hasPendingLocks`), `ResultTable.vue` (opaque scroll-target highlight), `results/ResultsToolbar.vue` (wraps / scrolls instead of overflowing at 1280 px), `setup/BetSizesPanel.vue` (re-check fields when the config is replaced, so stale red outlines disappear), `solver-session.ts` (the 16-bit fallback message appended to, not replacing, a bunching warning).

- [ ] **Step 1: Failing test** for the only pure part: `solver-session.test.ts` — `the fallback message keeps the bunching warning`. **Step 2: FAIL → fix → PASS.** **Step 3: the other items; lint, vue-tsc, test.** **Step 4: CDP at 1280 px** (toolbar, empty-hands line). **Step 5: Commit** `fix: small defects left by the redesign`.

### Task 5: PR

- [ ] Push `feat/ui-library`, PR to `dev`, CI green; final review fixes; merge when clean (user's standing permission for this redesign).

## Rulings carried by this plan

- The bunching fold ranges keep their own editor and saved-range picker (`RangeEditor` + `DbItemPicker`), restyled: replacing them is not needed for the redesign and risks losing a feature.
- The Library row click opens the solution (spec); Load stays reachable through the row, rename / export / delete move to the ⋯ menu.
