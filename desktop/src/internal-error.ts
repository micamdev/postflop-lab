// After an internal error in a Rust command (a panic caught there, see guard.rs), the app tells
// the user. Rust resets what the panic touched and says so in the message: the app then stops
// showing a game that no longer exists, or forgets the bunching data.

import { useStore, setSolutionLocks } from "./store";

/** Tags Rust adds to the message (guard.rs). */
export const TAG_SOLUTION_RESET = "(solution reset)";
export const TAG_BUNCHING_RESET = "(bunching data reset)";

export const handleInternalError = (message: string) => {
  const store = useStore();
  store.appError = message;
  if (message.includes(TAG_BUNCHING_RESET)) {
    store.bunchingFlop = [];
    store.isBunchingRunning = false;
  }
  if (!message.includes(TAG_SOLUTION_RESET)) return;
  store.isSolverRunning = false;
  store.isSolverPaused = false;
  store.isFinalizing = false;
  store.isSolveStarting = false;
  store.isSolverFinished = false;
  store.isLibraryBusy = false;
  store.isSaveDialogOpen = false;
  store.solutionInfo = null;
  store.isSolutionSaved = false;
  setSolutionLocks([]);
  store.treeResetCount++;
};
