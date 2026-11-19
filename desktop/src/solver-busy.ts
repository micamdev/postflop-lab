// Whether the solver or the main game is taken by another operation: a solve, a lock
// re-solve, a bunching precomputation, a library load. A batch runs on its own games and is
// checked apart (useBatch().isRunning).

import { computed } from "vue";
import { useStore } from "./store";
import { useSolverSession } from "./solver-session";
import { updateState } from "./update";

export const useSolverBusy = () => {
  const store = useStore();
  const session = useSolverSession();
  return computed(
    () =>
      store.isLibraryBusy ||
      store.isBunchingRunning ||
      session.isBuilding ||
      store.isSolveStarting ||
      store.isSolverRunning ||
      store.isSolverPaused ||
      store.isFinalizing ||
      // Installing an update closes the app.
      updateState.phase === "downloading" ||
      updateState.phase === "installing"
  );
};
