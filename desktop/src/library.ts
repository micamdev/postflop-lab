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
    turn: "Rivers are re-solved on demand when you pick them.",
    flop: "Cannot go past the flop. Best for flop reports.",
  }[depth];
};

/**
 * Loads a solution from the library and restores the app state (ranges, board, tree
 * configuration, results). Returns an error message, or null on success or cancel.
 */
export const loadSolution = async (name: string): Promise<string | null> => {
  const store = useStore();

  if (store.isSolverRunning || store.isSolverPaused || store.isFinalizing) {
    return "Stop the solver before loading a solution.";
  }
  if (store.isLibraryBusy) return null;

  // Refused loads (unreadable file, not enough memory) leave everything as it is.
  try {
    await invokes.libraryCheckLoad(name);
  } catch (e) {
    return String(e);
  }
  if (
    store.isSolverFinished &&
    !store.isSolutionSaved &&
    !(await ask("The current solution is not saved. Load another one anyway?"))
  ) {
    return null;
  }

  store.isLibraryBusy = true;
  try {
    return await replaceWithSolution(name);
  } finally {
    store.isLibraryBusy = false;
  }
};

const replaceWithSolution = async (name: string): Promise<string | null> => {
  const store = useStore();
  const config = useConfigStore();

  const previous = {
    isSolverFinished: store.isSolverFinished,
    solutionInfo: store.solutionInfo,
    isSolutionSaved: store.isSolutionSaved,
  };

  // Clears the results view; it is initialized again once the solution is loaded.
  store.isSolverFinished = false;
  store.solutionInfo = null;
  store.isSolutionSaved = false;
  await nextTick();

  let meta: invokes.SolutionMeta;
  try {
    meta = await invokes.libraryLoad(name);
  } catch (e) {
    const message = String(e);
    if (message.startsWith(invokes.ERR_GAME_FREED)) {
      // The previous game is gone: the tree built in Run Solver is no longer valid.
      store.treeResetCount++;
      return (
        "The solution could not be read (the file may be damaged): " +
        message.slice(invokes.ERR_GAME_FREED.length + 2)
      );
    }
    // Refused before the game was touched: restore the previous state and results view.
    store.solutionInfo = previous.solutionInfo;
    store.isSolutionSaved = previous.isSolutionSaved;
    store.isSolverFinished = previous.isSolverFinished;
    return message;
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
  store.treeResetCount++;
  store.solutionLoadCount++;
  store.isSolverFinished = true;
  store.navView = "results";
  return null;
};
