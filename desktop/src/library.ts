import { nextTick } from "vue";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  useStore,
  useConfigStore,
  saveConfigTmp,
  saveConfig,
  SolutionDepth,
} from "./store";
import * as invokes from "./invokes";

/** Asks a yes/no question in a native dialog. */
export const ask = async (message: string): Promise<boolean> => {
  return await confirm(message, { title: "Postflop Lab", kind: "warning" });
};

/** Human-readable size, e.g. "1.25 GB" or "740 MB". */
export const formatBytes = (bytes: number): string => {
  if (bytes >= 1023.5 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
  if (bytes >= 1023.5 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(0) + " MB";
  }
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
};

export const depthLabel = (depth: SolutionDepth): string => {
  return { river: "Complete", turn: "Up to the turn", flop: "Flop only" }[
    depth
  ];
};

/** What a save at this depth cannot show once reloaded. */
export const depthLoss = (depth: SolutionDepth): string => {
  return {
    river: "Everything is kept.",
    turn: "No river strategies: the solution stops at the river card.",
    flop: "No turn or river strategies, and no turn card report.",
  }[depth];
};

/**
 * Loads a solution from the library and restores the app state (ranges, board, tree
 * configuration, results). Returns an error message, or null on success or cancel.
 */
export const loadSolution = async (name: string): Promise<string | null> => {
  const store = useStore();
  const config = useConfigStore();

  if (store.isSolverRunning || store.isSolverPaused || store.isFinalizing) {
    return "Stop the solver before loading a solution.";
  }
  if (
    store.isSolverFinished &&
    !store.isSolutionSaved &&
    !(await ask("The current solution is not saved. Load another one anyway?"))
  ) {
    return null;
  }

  // Clears the results view; it is initialized again once the solution is loaded.
  store.isSolverFinished = false;
  store.solutionInfo = null;
  store.isSolutionSaved = false;
  await nextTick();

  let meta: invokes.SolutionMeta;
  try {
    meta = await invokes.libraryLoad(name);
  } catch (e) {
    return String(e);
  }

  Object.assign(config, meta.tree_config);
  saveConfigTmp();
  saveConfig();

  for (const player of [0, 1]) {
    const weights = await invokes.rangeGetWeights(player);
    for (let i = 0; i < 13 * 13; ++i) {
      store.ranges[player][i] = weights[i] * 100;
    }
  }

  store.isBunchingEnabled = false;
  store.solutionDepth = meta.depth;
  store.solutionInfo = {
    name,
    loaded: true,
    iterations: meta.iterations,
    exploitability: meta.exploitability,
  };
  store.isSolutionSaved = true;
  store.isSolverFinished = true;
  store.navView = "results";
  return null;
};
