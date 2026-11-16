# Refonte UI — PR 1 « Fondations » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app frame (blue nav bar + 8-item sidebar + Run Solver page) with the Graphite frame: thin top bar (solution, status, Setup | Results | Library, ⚙ Solve settings, ?, main action with solve progress), a Graphite theme and a small UI kit, while the existing pages keep working inside it.

**Architecture:** The solve logic leaves `RunSolver.vue` for a Pinia store (`solver-session.ts`) driven by the top bar and the lock editor; pure decision helpers (status, main action, progress, precision, settings) live in small TS modules covered by Vitest. Theme = CSS variables exposed as Tailwind colors; interactive primitives come from Reka UI; a temporary `legacy.css` layer darkens the not-yet-rebuilt pages (removed in PR 4).

**Tech Stack:** Vue 3.5, Pinia, Tailwind 3.4, TypeScript, Tauri 2, Reka UI (new), Vitest (new, dev only).

**Spec:** `docs/superpowers/specs/2026-11-16-refonte-interface-design.md` (mockups in `docs/superpowers/specs/ui-redesign/`).

## Global Constraints

- App text stays in English; commits without any Co-Authored-By line.
- Keep Vue 3 + Tailwind 3.4 + Pinia; only new runtime dependency: `reka-ui`. Only new dev dependency: `vitest`.
- Graphite values (exact): fond `#151517`, panneau `#1d1d20`, panneau 2 `#242428`, bordure `#323238`, texte `#ececee`, texte secondaire `#9a9aa3`, accent `#2fb5a1`, case vide `#26262a`, OOP `#5b8def`, IP `#e0a03c`.
- One accent-coloured main action per screen; other buttons are discreet (outline), grouped.
- No app name / version / GitHub link in the top bar (they go to About).
- Library opens at startup.
- Window: default 1600 × 950, minimum width 1280 (was 1080), minimum height 720.
- Solve settings remembered between launches: threads, precision, target exploitability, max iterations (not bunching ranges, not "ignore RAM limit").
- No engine change; no Rust change in this PR.
- CI front job must stay green: `pnpm lint` (max-warnings 0), `vue-tsc --noEmit`, plus the new `pnpm test`.
- Never kill the user's dev app; test the app on vite port 5391 with CDP on 9222 (`.superpowers/scratch/tauri-port.json`, `cdp.mjs`), stop it with TaskStop on its own task.

## Review Focus

1. Solve pressed with an invalid setup (board < 3 cards, bad bet string): a readable message under the top bar, nothing launched, state unchanged — Task 5 CDP check.
2. Not enough memory for the preferred precision: falls back to 16-bit when that fits, otherwise refuses with the needed vs available amounts, unless "Ignore RAM limit" is ticked — Task 2 tests `choosePrecision`.
3. Corrupt, partial or old remembered settings: defaults used field by field, no crash — Task 1 test `loadSolveSettings ignores invalid fields`.
4. Solve pressed while an unsaved solution (or locks) exists: confirmation first; cancelling keeps the solution — Task 5 CDP check.
5. A solution that cannot be saved (partial save, bunching): the top bar never offers Save as main action — Task 2 test `primaryAction never offers an impossible save`.

---

### Task 1: Remembered solve settings + Vitest

**Files:**
- Create: `desktop/src/solve-settings.ts`, `desktop/src/solve-settings.test.ts`
- Modify: `desktop/package.json` (devDependency `vitest`, script `"test": "vitest run"`), `.github/workflows/ci.yml` (front job: `- run: pnpm test` after vue-tsc)

**Interfaces:**
- Produces:
  ```ts
  export type Precision = "32" | "16";
  export interface SolveSettings { threads: number; precision: Precision; targetExploitability: number; maxIterations: number; }
  export const SETTINGS_KEY = "postflop-lab.solve-settings.v1";
  export const defaultSolveSettings = (hardwareThreads: number): SolveSettings; // threads = clamp(hardwareThreads,1,64), "32", 0.3, 1000
  export const validateSolveSettings = (s: SolveSettings): string | null; // human message or null
  export const loadSolveSettings = (storage: Pick<Storage, "getItem">, hardwareThreads: number): SolveSettings;
  export const saveSolveSettings = (storage: Pick<Storage, "setItem">, s: SolveSettings): void;
  ```

- [ ] **Step 1: Install vitest, add the `test` script and the CI step.**
- [ ] **Step 2: Write the failing tests** in `solve-settings.test.ts`:
  - `defaults` — `defaultSolveSettings(8)` equals `{threads: 8, precision: "32", targetExploitability: 0.3, maxIterations: 1000}`; `defaultSolveSettings(0).threads === 1`; `defaultSolveSettings(128).threads === 64`.
  - `validate` — null for defaults; message for threads 0, 65, 2.5; target 0 and -1; maxIterations -1, 1.5, 100001; values at bounds (1, 64, 100000, 0 iterations) are valid.
  - `round trip` — save then load (fake storage object) returns the same settings.
  - `loadSolveSettings ignores invalid fields` — stored `{"threads": 999, "precision": "8", "targetExploitability": 0.5}` loads as `{threads: default, precision: "32", targetExploitability: 0.5, maxIterations: 1000}`; stored `"not json"` and missing key both give defaults.
- [ ] **Step 3: Run `pnpm test`** — Expected: FAIL (module missing).
- [ ] **Step 4: Implement `solve-settings.ts`** (each field kept only if it passes its own check).
- [ ] **Step 5: Run `pnpm test`, `pnpm lint`, `pnpm exec vue-tsc --noEmit`** — Expected: all pass.
- [ ] **Step 6: Commit** `feat: remembered solve settings and Vitest`.

### Task 2: Pure decision helpers for the top bar

**Files:**
- Create: `desktop/src/solve-status.ts`, `desktop/src/solve-status.test.ts`

**Interfaces:**
- Consumes: `Precision` (Task 1).
- Produces:
  ```ts
  export interface SolveFlags { hasGame: boolean; isSolverRunning: boolean; isSolverPaused: boolean; isFinalizing: boolean; isSolverFinished: boolean; isSolverError: boolean; isSolutionSaved: boolean; }
  export type StatusTone = "neutral" | "busy" | "warn" | "ok" | "error";
  export const solutionStatus = (f: SolveFlags): { label: string; tone: StatusTone };
  export type PrimaryAction = "solve" | "save" | "progress";
  export const primaryAction = (f: SolveFlags, canSave: boolean): PrimaryAction;
  export const progressFraction = (p: { iteration: number; maxIterations: number; initialExploitability: number; exploitability: number; target: number }): number; // [0,1]
  export type PrecisionChoice = { ok: true; compression: boolean; fellBack: boolean } | { ok: false; message: string };
  export const choosePrecision = (preferred: Precision, need32: number, need16: number, available: number, ignoreLimit: boolean): PrecisionChoice;
  ```

- [ ] **Step 1: Write the failing tests:**
  - `solutionStatus` labels: no game → "Not solved"/neutral; running → "Solving…"/busy; paused → "Paused"/warn; finalizing → "Finalizing…"/busy; error → "Error"/error; finished unsaved → "Not saved"/warn; finished saved → "Saved"/ok.
  - `primaryAction`: running, paused or finalizing → "progress"; finished + unsaved + canSave → "save"; otherwise "solve".
  - `primaryAction never offers an impossible save` — finished + unsaved + `canSave=false` → "solve".
  - `progressFraction`: iteration 500 of 1000 with no exploitability gain → 0.5; exploitability halfway in log scale between initial 100 and target 1 (i.e. 10) at iteration 0 → 0.5; result clamped to [0,1] (exploitability below target → 1; NaN/Infinity inputs → 0).
  - `choosePrecision`: "32" fits → `{ok, compression:false, fellBack:false}`; "32" too big but 16 fits → `{ok, compression:true, fellBack:true}`; "16" preferred and fits → compression true, fellBack false; neither fits → `ok:false` with a message containing both amounts formatted by `formatBytes` from `library.ts` (e.g. "Needs 12.30 GB, 8.10 GB available"); neither fits but `ignoreLimit` → ok with the preferred precision.
- [ ] **Step 2: Run `pnpm test`** — Expected: FAIL.
- [ ] **Step 3: Implement `solve-status.ts`.** Progress = max(iteration / maxIterations, log(initial / current) / log(initial / target)).
- [ ] **Step 4: Run `pnpm test`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: status, main action, progress and precision helpers`.

### Task 3: Solve logic moves to a Pinia store

**Files:**
- Create: `desktop/src/solver-session.ts`
- Modify: `desktop/src/components/NodeLockEditor.vue` (start the locked solve through the store), `desktop/src/store.ts` (remove `lockSolveRequest`)
- Delete (in Task 5, once nothing mounts it): `RunSolver.vue`

**Interfaces:**
- Consumes: Tasks 1 and 2; `checkConfig` moves unchanged from `RunSolver.vue` to `solver-session.ts`.
- Produces: `useSolverSession` (Pinia setup store) with
  - state: `settings: SolveSettings` (loaded at creation, saved on change via `watch`), `ignoreMemoryLimit: boolean`, `iteration: number`, `exploitability: number`, `initialExploitability: number`, `elapsedMs: number`, `message: string` (last error or warning, "" if none), `isBuilding: boolean`;
  - getters: `flags: SolveFlags`, `canSave: boolean`, `saveDisabledReason: string` (texts unchanged from RunSolver);
  - actions: `solve(): Promise<void>` (check config → build tree → memory check with `choosePrecision` → allocate → bunching data → solve loop; on any refusal sets `message` and leaves the previous state), `pause()`, `resume(): Promise<void>`, `stop()`, `runLockedSolve(compression: boolean): Promise<void>` (same body as today's), `clearMessage()`.
  - Behaviour kept from RunSolver: `saveConfigTmp/saveConfig`, `setSolutionLocks([])` and `returnLine = null` on a new tree, `treeResetCount` watch, solution info reset, `isSolverFinished` + `navView = "results"` when a locked solve with `returnLine` ends, the 10-iteration exploitability refresh, bunching precomputation errors.
  - When `fellBack` is true, `message` = "Not enough memory for 32-bit precision: solving in 16-bit."

- [ ] **Step 1: Create the store** by moving the script logic of `RunSolver.vue` (lines 379–839 at commit 6c9dc4a); `RunSolver.vue` keeps only its template, now bound to the store, so the app still works between tasks.
- [ ] **Step 2: NodeLockEditor** calls `await session.runLockedSolve(compression)` instead of setting `lockSolveRequest` and switching to the Run Solver view; it stays on Results (the lock editor closes as today).
- [ ] **Step 3: Run `pnpm test`, `pnpm lint`, `pnpm exec vue-tsc --noEmit`** — Expected: pass; `grep -rn lockSolveRequest desktop/src` — Expected: no match.
- [ ] **Step 4: App check over CDP** (setup.mjs-style: ranges + flop Td9d6h + bets, then click Run Solver's buttons): solve finishes, exploitability shown; a locked re-solve from the editor ends on Results at the locked node.
- [ ] **Step 5: Commit** `refactor: solve logic in a Pinia store`.

### Task 4: Graphite theme, Reka UI and the UI kit

**Files:**
- Modify: `desktop/tailwind.config.js` (colors), `desktop/src/style.css` (variables, body, `.button-*` remapped), `desktop/package.json` (`reka-ui`), `desktop/src-tauri/tauri.conf.json` (window 1600×950, minWidth 1280), `desktop/src/main.ts` (maximize when the screen is smaller than the default size; permission `core:window:allow-maximize` in `capabilities/default.json`)
- Create: `desktop/src/legacy.css` (imported by `style.css`), `desktop/src/components/ui/UiButton.vue`, `UiSegmented.vue`, `UiPanel.vue`, `UiMenu.vue`, `UiTooltip.vue`, `UiField.vue`, `UiSlideOver.vue`

**Interfaces:**
- Produces:
  - Tailwind colors: `bg`, `panel`, `panel2`, `line`, `ink`, `muted`, `accent`, `cell`, `oop`, `ip` (each `var(--…)`), plus `act-check #3fae6e`, `act-bet1 #e0704f`, `act-bet2 #c4473a`, `act-bet3 #9e2f2b`, `act-fold #4f86c6`.
  - `UiButton` props `variant: "primary" | "ghost" | "danger" = "ghost"`, `size: "sm" | "md" = "md"`, `disabled`; slot.
  - `UiSegmented` `v-model: string`, prop `options: { value: string; label: string; disabled?: boolean }[]`.
  - `UiPanel` prop `title?: string`; slots `default`, `actions`.
  - `UiMenu` (Reka DropdownMenu) slot `trigger`; prop `items: { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }[]`.
  - `UiTooltip` (Reka Tooltip) prop `text: string`; slot = trigger.
  - `UiField` props `label: string`, `error?: string`, `suffix?: string`; slot = input.
  - `UiSlideOver` (Reka Dialog, `modal=false`, right edge, 360 px) `v-model:open`, prop `title`.
  - `legacy.css`: inside `.legacy`, maps the light utilities used by old pages (`bg-white`, `bg-gray-50…200`, `text-gray-500…900`, `border-gray-*`, `hover:bg-blue-100`, form inputs/selects) to Graphite values. Header comment: "Temporary: removed in PR 4 once every page is rebuilt."

- [ ] **Step 1: Add `reka-ui`, the variables, Tailwind colors, `legacy.css` and the button remap** (`.button-blue` → accent; `.button-green` and `.button-red` → ghost / danger outline).
- [ ] **Step 2: Write the seven Ui components** (Graphite look of the mockups: radius 6–8 px, panel2 fields, 1 px `line` borders, accent only on primary and selected segments).
- [ ] **Step 3: Window size and maximize-on-small-screen.**
- [ ] **Step 4: Run `pnpm lint`, `pnpm exec vue-tsc --noEmit`, `pnpm test`** — Expected: pass.
- [ ] **Step 5: Commit** `feat: Graphite theme and UI kit`.

### Task 5: The new frame

**Files:**
- Create: `desktop/src/components/TopBar.vue`, `desktop/src/components/SolveSettingsPanel.vue`, `desktop/src/components/SetupNav.vue`
- Modify: `desktop/src/components/App.vue`, `desktop/src/store.ts` (`NavView = "setup" | "results" | "library"`, default `"library"`; `SideView = "oop-range" | "ip-range" | "board" | "tree-config" | "bunching"`; headers updated), `desktop/src/library.ts` and `LibraryPage.vue` (view names), `AboutPage.vue` (now shows app name, version and GitHub link; opened in a Reka Dialog from "?")
- Delete: `NavBar.vue`, `SideBar.vue`, `RunSolver.vue`

**Interfaces:**
- Consumes: `useSolverSession` (Task 3), helpers (Task 2), Ui kit (Task 4), `SaveSolutionDialog.vue` unchanged.
- TopBar, left to right: board cards (suit-coloured chips) + solution name (`solutionInfo.name`, else "New spot") + status pill (`solutionStatus`); `UiSegmented` Setup | Results | Library; spacer; ⚙ (opens SolveSettingsPanel); ? (About dialog); main action from `primaryAction`:
  - "solve": primary `▶ Solve`; asks `"The current solution is not saved. Solve a new one anyway?"` (via `ask`) when a finished solution is unsaved or has locks; then `session.solve()`.
  - "save": primary `Save` (opens SaveSolutionDialog) and a ghost `▶ Solve` next to it.
  - "progress": thin progress bar (`progressFraction`), "it {n} · {exploitability} ({%})", elapsed time, Pause/Resume and Stop ghost buttons.
  - `session.message` shows as a dismissible line under the top bar (warn colour).
- SolveSettingsPanel (UiSlideOver): threads, precision (UiSegmented 32-bit / 16-bit, disabled while a game is allocated), target exploitability (%), max iterations, each with UiField + error from `validateSolveSettings`; "Ignore RAM limit (not recommended)" checkbox; section "Advanced": bunching status ("Off" / "On — flop X") and a link "Bunching effect…" that sets `navView="setup"`, `sideView="bunching"` and closes the panel. The precision help text from RunSolver moves into a UiTooltip.
- SetupNav: vertical Graphite list (OOP range with mini viewer, IP range with mini viewer, Board with cards, Tree) shown left of the Setup content; Bunching has no entry (reached from the panel) and shows a "← Back to setup" ghost button.
- App.vue: TopBar, then Setup (SetupNav + legacy pages wrapped in `.legacy`), Results (`ResultViewer` in `.legacy`) or Library (`LibraryPage` in `.legacy`).

- [ ] **Step 1: Store view names and every reference** (`grep -rn "navView\|sideView" desktop/src` reviewed; no `"solver"`, `"run-solver"`, `"library"` or `"about"` side views left).
- [ ] **Step 2: TopBar, SolveSettingsPanel, SetupNav, About dialog, App.vue; delete NavBar, SideBar, RunSolver.**
- [ ] **Step 3: Run `pnpm lint`, `pnpm exec vue-tsc --noEmit`, `pnpm test`** — Expected: pass.
- [ ] **Step 4: App check over CDP, with screenshots in `.superpowers/scratch/ui/`:**
  - startup shows Library; loading a solution opens Results with the pill "Saved" and its name;
  - Setup: ranges + board Td9d6h + bets, ⚙ → threads 4, close; Solve → progress in the top bar, pause/resume, end → Results, pill "Not saved", main action Save; Save from the top bar → pill "Saved";
  - invalid setup (board cleared) → Solve shows the message, nothing runs (Review Focus 1);
  - Solve on the unsaved solution → confirmation (native dialog: check via `ask` being called — log it, the user checks the dialog manually) (Review Focus 4);
  - restart the app → threads still 4;
  - locked re-solve from the editor → stays on Results, ends at the locked node.
- [ ] **Step 5: Commit** `feat: Graphite app frame with top bar and solve settings`.

### Task 6: PR

- [ ] **Step 1:** Push `feat/ui-foundation`, open the PR to `dev` (summary, screenshots before/after, deferred items: live memory estimate and single-page Setup → PR 2; "Re-solve with locks" as top-bar main action → PR 3, Results), wait for CI green.

## Rulings carried by this plan

- The single Solve button and the end of the Run Solver page land in PR 1 (the spec lists the single button in PR 2): the frame cannot keep a Run Solver page once its controls live in the top bar. The live memory estimate stays in PR 2.
- "Re-solve with locks" as top-bar main action (spec choice 2) moves to PR 3 with the Results rebuild, where the lock editor is rebuilt; in PR 1 it stays in the editor.
- Old pages are darkened by a temporary `legacy.css` scope instead of being restyled one by one; PR 2–4 rebuild them and PR 4 deletes the file.
- Component behaviour is checked in the app over CDP (no Vue component test runner); pure logic is unit-tested with Vitest.
