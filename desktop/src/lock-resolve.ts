// Re-solving the current solution with its node locks, from the lock editor or the top bar:
// offer to save it first, rebuild the game with the locks, solve, then come back to the line.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useStore } from "./store";
import * as invokes from "./invokes";
import { choose } from "./library";
import { useSolverSession } from "./solver-session";
import { useBatch } from "./use-batch";
import { validateSolveSettings } from "./solve-settings";

type Line = { history: number[]; label: string };

export const useLockResolve = defineStore("lockResolve", () => {
  const store = useStore();
  // While the tree is rebuilt with the locks: no click may reach the game.
  const isBusy = ref(false);
  const error = ref("");
  /** Line to come back to once the save dialog opened by "Save first" closes. */
  let waitingLine: Line | null = null;

  /** The lock editor is storing a lock: the lock list is about to change. */
  const isCapturing = ref(false);

  /** Why a re-solve with locks cannot start now, or "" (shared by both buttons). */
  const disabledReason = computed(() => {
    if (isCapturing.value) return "A lock is being saved.";
    if (store.isLibraryBusy && !isBusy.value) return "The library is busy.";
    if (store.isBunchingEnabled && store.bunchingFlop.length > 0) {
      return "Locks are not available with the bunching effect.";
    }
    if (store.isSolveStarting) return "A solve is starting.";
    if (store.isBunchingRunning)
      return "The bunching effect is being precomputed.";
    if (useBatch().isRunning) return "A batch is solving flops.";
    const settingsError = validateSolveSettings(useSolverSession().settings);
    if (settingsError) {
      return `Solve settings (Setup › Solve): ${settingsError}`;
    }
    return "";
  });

  const resolve = async (line: Line) => {
    const session = useSolverSession();
    const locks = store.locks.map((lock) => ({ ...lock }));
    isBusy.value = true;
    store.isLibraryBusy = true;
    let compression: boolean;
    try {
      compression = await invokes.gamePrepareLockSolve(locks);
    } catch (e) {
      // The reference solution is untouched (unless an internal error reset it: then
      // internal-error.ts already dropped it).
      store.isLibraryBusy = false;
      error.value = String(e);
      return;
    } finally {
      isBusy.value = false;
    }
    // The game is now unsolved: mark the solver as running before releasing the library
    // lock, so no other action (Solve, Load) can start in between.
    store.isSolverFinished = false;
    store.isSolverRunning = true;
    store.isLibraryBusy = false;
    store.solutionLocks = locks;
    store.locks = [...locks];
    store.returnLine = [...line.history];
    void session.runLockedSolve(compression);
  };

  /** Re-solves with `store.locks`, coming back to `line` at the end. */
  const start = async (line: Line) => {
    error.value = "";
    // Checked before anything: a refusal after the prepare would lose the solution.
    if (disabledReason.value) {
      error.value = disabledReason.value;
      return;
    }
    const canSave = useSolverSession().saveDisabledReason === "";
    if (!store.isSolutionSaved && canSave) {
      const choice = await choose(
        "The current solution is not saved and re-solving replaces it. Save it first?",
        { yes: "Save first", no: "Re-solve without saving", cancel: "Cancel" }
      );
      if (choice === "Cancel") return;
      if (choice === "Save first") {
        waitingLine = line;
        store.isSaveDialogOpen = true;
        return;
      }
    }
    await resolve(line);
  };

  /**
   * The save dialog closed: re-solve if it was opened by "Save first" and the solution was
   * saved. Returns whether a re-solve was attempted (its error is then in `error`).
   */
  const onSaveDialogClosed = async (): Promise<boolean> => {
    error.value = "";
    const line = waitingLine;
    waitingLine = null;
    if (!line || !store.isSolutionSaved) return false;
    await resolve(line);
    return true;
  };

  return {
    isBusy,
    error,
    isCapturing,
    disabledReason,
    start,
    onSaveDialogClosed,
  };
});
