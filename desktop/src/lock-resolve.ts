// Re-solving the current solution with its node locks, from the lock editor or the top bar:
// offer to save it first, rebuild the game with the locks, solve, then come back to the line.

import { defineStore } from "pinia";
import { ref } from "vue";
import { useStore } from "./store";
import * as invokes from "./invokes";
import { choose } from "./library";
import { useSolverSession } from "./solver-session";

type Line = { history: number[]; label: string };

export const useLockResolve = defineStore("lockResolve", () => {
  const store = useStore();
  const isBusy = ref(false);
  const error = ref("");
  /** Line to come back to once the save dialog opened by "Save first" closes. */
  let waitingLine: Line | null = null;

  const resolve = async (line: Line) => {
    const session = useSolverSession();
    const locks = store.locks.map((lock) => ({ ...lock }));
    isBusy.value = true;
    store.isLibraryBusy = true;
    let compression: boolean;
    try {
      compression = await invokes.gamePrepareLockSolve(locks);
    } catch (e) {
      // The reference solution is untouched.
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

  /** The save dialog closed: re-solve if the solution was saved (not if cancelled). */
  const onSaveDialogClosed = async () => {
    const line = waitingLine;
    waitingLine = null;
    if (line && store.isSolutionSaved) await resolve(line);
  };

  return { isBusy, error, start, onSaveDialogClosed };
});
