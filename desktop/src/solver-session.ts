// Solve session: builds the tree, runs the solver loop and keeps its progress, for the top
// bar, the solve settings and the lock editor. (Moved out of the former Run Solver page.)

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
  useStore,
  useConfigStore,
  useSavedConfigStore,
  snapshotSetup,
  setSavedSetup,
  setSolutionLocks,
} from "./store";
import * as invokes from "./invokes";
import { gameTreeArgs } from "./game-args";
import {
  loadSolveSettings,
  saveSolveSettings,
  validateSolveSettings,
  threadsError,
} from "./solve-settings";
import { SolveFlags, choosePrecision } from "./solve-status";

export { checkConfig, solveBlocker } from "./setup-validation";
import { checkConfig } from "./setup-validation";
import { spotRecord } from "./spot";

/** Memory the solver may use: available memory, or 70% of the total on macOS; unlimited when
 * the system did not report it (0). */
export const memoryLimit = async () => {
  const [available, total] = await invokes.memory();
  const limit = (await invokes.osName()) === "macos" ? total * 0.7 : available;
  return limit > 0 ? limit : Number.POSITIVE_INFINITY;
};

export const useSolverSession = defineStore("solverSession", () => {
  const store = useStore();
  const config = useConfigStore();
  const savedConfig = useSavedConfigStore();

  const settings = ref(
    loadSolveSettings(localStorage, navigator.hardwareConcurrency || 1)
  );
  watch(
    settings,
    (s) => {
      if (validateSolveSettings(s) === null) saveSolveSettings(localStorage, s);
    },
    { deep: true }
  );
  // Whether the current solution was solved with the bunching effect (it cannot be saved).
  const solvedWithBunching = ref(false);
  // The thread setting also applies to river re-solves: send it at once, not only on Solve.
  watch(
    () => settings.value.threads,
    (threads) => {
      // A bunching precomputation uses its own count (restored when it ends).
      if (threadsError(threads) === null && !store.isBunchingRunning) {
        void invokes.setNumThreads(threads).catch(() => {});
      }
    },
    { immediate: true }
  );
  /** Not remembered: solve even when the memory looks insufficient. */
  const ignoreMemoryLimit = ref(false);

  const isTreeBuilt = ref(false);
  const isBuilding = ref(false);
  /** Last error or warning for the user, "" if none. */
  const message = ref("");
  /** Precision of the allocated game (true = 16-bit). */
  const compression = ref(false);
  const memoryNeed32 = ref(0);
  const memoryNeed16 = ref(0);
  const memoryBunching = ref(0);
  const iteration = ref(-1);
  const exploitability = ref(Number.POSITIVE_INFINITY);
  const initialExploitability = ref(Number.POSITIVE_INFINITY);
  const elapsedMs = ref(-1);

  let terminateFlag = false;
  let pauseFlag = false;
  /** performance.now() when the running segment started, 0 when not running. */
  const segmentStart = ref(0);
  let exploitabilityUpdated = false;

  const isBunchingActive = () =>
    store.isBunchingEnabled && store.bunchingFlop.length > 0;

  const flags = computed<SolveFlags>(() => ({
    hasGame: isTreeBuilt.value || store.isSolverFinished,
    isSolverRunning: store.isSolverRunning,
    isSolverPaused: store.isSolverPaused,
    isFinalizing: store.isFinalizing,
    isSolverFinished: store.isSolverFinished,
    isSolverError: store.isSolverError,
    isSolutionSaved: store.isSolutionSaved,
  }));

  /** Why the current solution cannot be saved, or "" if it can. */
  const saveDisabledReason = computed(() => {
    if (solvedWithBunching.value) {
      return "Solutions computed with the bunching effect cannot be saved.";
    }
    if (store.solutionDepth !== "river") {
      return "This solution was loaded from a partial save.";
    }
    return "";
  });
  const canSave = computed(
    () =>
      store.isSolverFinished &&
      !saveDisabledReason.value &&
      !store.isLibraryBusy
  );

  // The game was replaced (solution loaded) or freed (failed load): the tree built here, its
  // memory figures and the solver state no longer apply.
  watch(
    () => store.treeResetCount,
    () => {
      isTreeBuilt.value = false;
      solvedWithBunching.value = false;
      memoryNeed32.value = 0;
      memoryNeed16.value = 0;
      memoryBunching.value = 0;
      iteration.value = -1;
      exploitability.value = Number.POSITIVE_INFINITY;
      initialExploitability.value = Number.POSITIVE_INFINITY;
      elapsedMs.value = -1;
    }
  );

  /** Forgets the previous solution when a new tree is built or solved. */
  const resetSolutionInfo = () => {
    solvedWithBunching.value = false;
    store.solutionInfo = null;
    store.isSolutionSaved = false;
    store.solutionDepth = "river";
  };

  // Checked against the Setup board before building: a refused solve keeps the old game.
  const areFlopMatching = () => {
    // No flop yet: the setup check reports the board.
    if (config.board.length < 3) return true;
    const flop = config.board.slice(0, 3);
    const bunchingFlop = store.bunchingFlop;
    return (
      !store.isBunchingEnabled ||
      bunchingFlop.length === 0 ||
      (flop[0] === bunchingFlop[0] &&
        flop[1] === bunchingFlop[1] &&
        flop[2] === bunchingFlop[2])
    );
  };

  /** Builds the tree from the setup; returns false (with `message`) if it cannot. */
  const buildTree = async (): Promise<boolean> => {
    const configError = checkConfig(config);
    if (configError !== null) {
      message.value = configError;
      return false;
    }

    // The setup as it is now: later edits do not change the tree being built.
    const setup = snapshotSetup();
    // The spot it was solved from (saved with the solution), as it is now.
    store.solvedSpot = store.spot ? spotRecord(store.spot, setup) : null;
    isBuilding.value = true;
    isTreeBuilt.value = false;
    // The game is about to be replaced: hide the old results (and close the lock editor) so
    // no click reaches a game that is not solved. They stay hidden if the build fails.
    store.isSolverFinished = false;
    store.isSolverError = false;
    resetSolutionInfo();

    let errorString: string | null;
    try {
      errorString = await invokes.gameInit(gameTreeArgs(setup));
    } finally {
      // Also on a rejected invoke: Solve must not stay disabled.
      isBuilding.value = false;
    }
    if (errorString) {
      message.value = errorString;
      return false;
    }

    setSavedSetup(setup);
    setSolutionLocks([]);
    store.returnLine = null;

    [memoryNeed32.value, memoryNeed16.value] = await invokes.gameMemoryUsage();
    memoryBunching.value = await invokes.gameMemoryUsageBunching();

    isTreeBuilt.value = true;
    store.isSolverRunning = false;
    store.isSolverPaused = false;
    store.isSolverFinished = false;
    store.isSolverError = false;
    return true;
  };

  /** Stops the solver state after an unexpected error, with the error shown. */
  const fail = (e: unknown) => {
    store.isSolverRunning = false;
    store.isSolverPaused = false;
    store.isFinalizing = false;
    store.isSolverError = true;
    segmentStart.value = 0;
    message.value = `Solver error: ${String(e)}`;
  };

  /** Builds the tree from the setup and solves it with the current settings. */
  const solve = async () => {
    // One start at a time; nothing else may touch the game until the solver runs.
    if (store.isSolveStarting) return;
    store.isSolveStarting = true;
    try {
      if (await startSolve()) {
        store.isSolveStarting = false;
        await resume();
      }
    } catch (e) {
      fail(e);
    } finally {
      store.isSolveStarting = false;
    }
  };

  /** Everything before the solve loop; returns whether the loop can start. */
  const startSolve = async (): Promise<boolean> => {
    message.value = "";
    const settingsError = validateSolveSettings(settings.value);
    if (settingsError) {
      message.value = settingsError;
      return false;
    }
    if (store.isBunchingEnabled && store.bunchingFlop.length === 0) {
      message.value =
        "Bunching effect is on but its data is not ready: solving without it.";
    }
    if (!areFlopMatching()) {
      message.value = "The flop and the bunching data do not match.";
      return false;
    }
    if (!(await buildTree())) return false;

    const extra = isBunchingActive() ? memoryBunching.value : 0;
    const choice = choosePrecision(
      settings.value.precision,
      memoryNeed32.value + extra,
      memoryNeed16.value + extra,
      await memoryLimit(),
      ignoreMemoryLimit.value
    );
    if (!choice.ok) {
      message.value = `Not enough memory: ${choice.message}.`;
      return false;
    }
    if (choice.fellBack) {
      // Added to an earlier warning (bunching data not ready), not replacing it.
      message.value = [
        message.value,
        "Not enough memory for 32-bit precision: solving in 16-bit.",
      ]
        .filter(Boolean)
        .join(" ");
    }
    compression.value = choice.compression;

    terminateFlag = false;
    pauseFlag = false;
    iteration.value = -1;
    exploitability.value = Number.POSITIVE_INFINITY;
    initialExploitability.value = Number.POSITIVE_INFINITY;
    elapsedMs.value = 0;
    store.isSolverRunning = true;
    segmentStart.value = performance.now();

    await invokes.setNumThreads(settings.value.threads);
    await invokes.gameAllocateMemory(compression.value);

    solvedWithBunching.value = isBunchingActive();
    if (isBunchingActive()) {
      iteration.value = -2;
      const errorString = await invokes.gameSetBunching();
      if (errorString) {
        message.value = errorString;
        store.isSolverRunning = false;
        store.isSolverError = true;
        return false;
      }
    }

    iteration.value = 0;
    exploitability.value = Math.max(await invokes.gameExploitability(), 0);
    initialExploitability.value = exploitability.value;
    exploitabilityUpdated = true;

    return true;
  };

  /**
   * Solves the game prepared with locks (tree rebuilt, memory allocated, locks placed by
   * `gamePrepareLockSolve`), with the current settings.
   */
  const runLockedSolve = async (lockCompression: boolean) => {
    // Before any await: the game is unsolved (also set by the lock editor).
    store.isSolverFinished = false;
    const settingsError = validateSolveSettings(settings.value);
    if (settingsError) {
      fail(settingsError);
      return;
    }
    try {
      store.isSolverRunning = true;
      store.isSolverPaused = false;
      store.isSolverError = false;
      resetSolutionInfo();
      compression.value = lockCompression;
      [memoryNeed32.value, memoryNeed16.value] =
        await invokes.gameMemoryUsage();
      memoryBunching.value = 0;
      isTreeBuilt.value = true;
      terminateFlag = false;
      pauseFlag = false;
      elapsedMs.value = 0;
      segmentStart.value = 0;

      iteration.value = 0;
      exploitability.value = Math.max(await invokes.gameExploitability(), 0);
      initialExploitability.value = exploitability.value;
      exploitabilityUpdated = true;
      await resume();
    } catch (e) {
      fail(e);
    }
  };

  const pause = () => {
    pauseFlag = true;
  };

  const stop = () => {
    terminateFlag = true;
    // A paused solve has no running loop to notice the flag: finish it here.
    if (store.isSolverPaused) void resume();
  };

  const resume = async () => {
    try {
      store.isSolverRunning = true;
      store.isSolverPaused = false;

      if (segmentStart.value === 0) {
        segmentStart.value = performance.now();
        // Editable during a pause: only a valid count reaches the engine (Stop resumes too).
        if (threadsError(settings.value.threads) === null) {
          await invokes.setNumThreads(settings.value.threads);
        }
      }

      // The pot of the solved tree: the Setup one may have been edited since.
      const target =
        (savedConfig.startingPot * settings.value.targetExploitability) / 100;

      while (
        !terminateFlag &&
        iteration.value < settings.value.maxIterations &&
        exploitability.value > target
      ) {
        if (pauseFlag) {
          elapsedMs.value += performance.now() - segmentStart.value;
          segmentStart.value = 0;
          pauseFlag = false;
          store.isSolverRunning = false;
          store.isSolverPaused = true;
          return;
        }

        await invokes.gameSolveStep(iteration.value);
        ++iteration.value;
        exploitabilityUpdated = false;

        if (iteration.value % 10 === 0) {
          exploitability.value = Math.max(
            await invokes.gameExploitability(),
            0
          );
          exploitabilityUpdated = true;
        }
      }

      if (!exploitabilityUpdated) {
        exploitability.value = Math.max(await invokes.gameExploitability(), 0);
      }

      store.isSolverRunning = false;
      store.isFinalizing = true;

      await invokes.gameFinalize();

      store.isFinalizing = false;
      store.solutionInfo = {
        name: null,
        loaded: false,
        iterations: iteration.value,
        exploitability: exploitability.value,
      };
      store.isSolverFinished = true;
      // Results opens (after a locked re-solve, at the node the lock was edited at).
      store.navView = "results";

      elapsedMs.value += performance.now() - segmentStart.value;
      segmentStart.value = 0;
    } catch (e) {
      fail(e);
    }
  };

  const clearMessage = () => {
    message.value = "";
  };

  return {
    settings,
    ignoreMemoryLimit,
    isTreeBuilt,
    isBuilding,
    message,
    compression,
    memoryNeed32,
    memoryNeed16,
    memoryBunching,
    iteration,
    exploitability,
    initialExploitability,
    elapsedMs,
    segmentStart,
    flags,
    saveDisabledReason,
    canSave,
    solve,
    runLockedSolve,
    pause,
    resume,
    stop,
    clearMessage,
  };
});
