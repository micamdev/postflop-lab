// Whether the solver or the main game is taken by another operation: a solve, a lock
// re-solve, a bunching precomputation, a library load, an update being installed. A batch
// runs on its own games and is checked apart (useBatch().isRunning).

import { computed } from "vue";
import { useStore } from "./store";
import { useSolverSession } from "./solver-session";
import { updateState } from "./update";

/**
 * What holds the solver now, as a sentence, or "" when it is free. `ignoreLibrary`: the
 * caller's own library operation (the lock re-solve's prepare) does not count.
 */
export const solverBusyReason = (options: { ignoreLibrary?: boolean } = {}) => {
  const store = useStore();
  const session = useSolverSession();
  if (store.isLibraryBusy && !options.ignoreLibrary)
    return "The library is busy.";
  if (store.isBunchingRunning)
    return "The bunching effect is being precomputed.";
  if (session.isBuilding) return "The tree is being built.";
  if (store.isSolveStarting) return "A solve is starting.";
  if (store.isSolverRunning) return "The solver is running.";
  if (store.isSolverPaused) return "The solver is paused.";
  if (store.isFinalizing) return "The solution is being finalized.";
  // Installing an update closes the app.
  if (
    updateState.phase === "downloading" ||
    updateState.phase === "installing"
  ) {
    return "An update is being installed.";
  }
  return "";
};

export const useSolverBusy = () => computed(() => solverBusyReason() !== "");
