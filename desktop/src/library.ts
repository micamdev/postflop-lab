import { nextTick } from "vue";
import { confirm, message } from "@tauri-apps/plugin-dialog";
import {
  emptySetup,
  useStore,
  useConfigStore,
  snapshotSetup,
  setSavedSetup,
  SolutionDepth,
  setSolutionLocks,
} from "./store";
import * as invokes from "./invokes";
import { DAMAGED_FILE } from "./library-list";
import { weightPercent } from "./utils";
import { leaveTreeEdit } from "./tree-edit-guard";
import { readSpotRecord } from "./spot";

/** Asks a yes/no question in a native dialog. */
export const ask = async (message: string): Promise<boolean> => {
  return await confirm(message, { title: "Postflop Lab", kind: "warning" });
};

/**
 * Asks a question with three labelled buttons in a native dialog. Returns the label of the
 * clicked button; closing the dialog counts as `cancel`.
 */
export const choose = async (
  text: string,
  buttons: { yes: string; no: string; cancel: string }
): Promise<string> => {
  const result = await message(text, {
    title: "Postflop Lab",
    kind: "warning",
    buttons,
  });
  return result === buttons.yes || result === buttons.no
    ? result
    : buttons.cancel;
};

export { formatBytes } from "./utils";

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

  if (
    store.isSolverRunning ||
    store.isSolverPaused ||
    store.isFinalizing ||
    store.isSolveStarting
  ) {
    return "Stop the solver before loading a solution.";
  }
  // One load at a time, from the very first await (a double click on a Library row).
  if (store.isLibraryBusy || isLoading) return null;
  isLoading = true;
  try {
    // Refused loads (unreadable file, not enough memory) leave everything as it is.
    try {
      await invokes.libraryCheckLoad(name);
    } catch (e) {
      return String(e);
    }
    if (
      store.isSolverFinished &&
      !store.isSolutionSaved &&
      !(await ask(
        "The current solution is not saved. Load another one anyway?"
      ))
    ) {
      return null;
    }
    // Last question: the loaded solution replaces an open tree lines edit.
    if (!(await leaveTreeEdit(undefined, "load"))) return null;

    store.isLibraryBusy = true;
    try {
      return await replaceWithSolution(name);
    } finally {
      store.isLibraryBusy = false;
    }
  } finally {
    isLoading = false;
  }
};

/** A load is in progress (set before its first await, unlike `isLibraryBusy`). */
let isLoading = false;

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
    // A panic in Rust (handled by internal-error.ts): the game was reset, nothing to restore.
    if (message.startsWith(invokes.ERR_INTERNAL)) return message;
    if (message.startsWith(invokes.ERR_GAME_FREED)) {
      // The previous game is gone: the tree built in Run Solver is no longer valid.
      store.treeResetCount++;
      setSolutionLocks([]);
      return (
        DAMAGED_FILE + ": " + message.slice(invokes.ERR_GAME_FREED.length + 2)
      );
    }
    // Refused before the game was touched: restore the previous state and results view.
    store.solutionInfo = previous.solutionInfo;
    store.isSolutionSaved = previous.isSolutionSaved;
    store.isSolverFinished = previous.isSolverFinished;
    return message;
  }

  // The Setup's own fields only: another version's extra fields would change the spot's key.
  for (const field of Object.keys(emptySetup())) {
    if (field !== "board" && field in meta.tree_config) {
      (config as unknown as Record<string, unknown>)[field] =
        meta.tree_config[field];
    }
  }
  config.board = meta.tree_config.board as number[];
  setSavedSetup(snapshotSetup());

  for (const player of [0, 1]) {
    const weights = await invokes.rangeGetWeights(player);
    for (let i = 0; i < 13 * 13; ++i) {
      store.ranges[player][i] = weightPercent(weights[i]);
    }
  }

  store.isBunchingEnabled = false;
  setSolutionLocks(meta.locks ?? []);
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
  // The ranges and the tree now come from the solution, not from the explorer.
  store.rangeSources = [null, null];
  store.treeSource = null;
  // Its spot is shown, not loaded.
  store.spot = null;
  store.solvedSpot = readSpotRecord(meta.tree_config.spot);
  store.isSolverFinished = true;
  store.navView = "results";
  return null;
};

/** Deletes a saved solution; the loaded one, if deleted, is no longer saved. */
export const deleteSolution = async (name: string): Promise<void> => {
  await invokes.libraryDelete(name);
  const store = useStore();
  if (store.solutionInfo?.name === name) store.isSolutionSaved = false;
};

/** Renames a saved solution; returns the file name the library used (e.g. "K/T" → "K_T"). */
export const renameSolution = async (
  from: string,
  to: string
): Promise<string> => {
  const name = await invokes.libraryRename(from, to);
  const store = useStore();
  if (store.solutionInfo?.name === from) store.solutionInfo.name = name;
  return name;
};

/**
 * Imports a `.plab` file into the library; returns its name there. Replacing the file of the
 * solution in memory makes that solution unsaved (it is no longer on disk).
 */
export const importSolution = async (
  path: string,
  overwrite: boolean
): Promise<string> => {
  const name = await invokes.libraryImport(path, overwrite);
  const store = useStore();
  if (store.solutionInfo?.name === name) store.isSolutionSaved = false;
  return name;
};
