// Solve session: builds the tree, runs the solver loop and keeps its progress, for the top
// bar, the solve settings and the lock editor. (Moved out of the former Run Solver page.)

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
  useStore,
  useConfigStore,
  useTmpConfigStore,
  useSavedConfigStore,
  saveConfigTmp,
  saveConfig,
  setSolutionLocks,
} from "./store";
import {
  MAX_AMOUNT,
  ROOT_LINE_STRING,
  INVALID_LINE_STRING,
  readableLineString,
} from "./utils";
import * as invokes from "./invokes";
import { gameTreeArgs } from "./game-args";
import {
  loadSolveSettings,
  saveSolveSettings,
  validateSolveSettings,
} from "./solve-settings";
import { SolveFlags, choosePrecision } from "./solve-status";

/** Why the tree cannot be built from `config`, or null. */
export const checkConfig = (
  config: ReturnType<typeof useConfigStore>
): string | null => {
  if (config.board.length < 3) {
    return "Board must consist of at least three cards";
  }

  if (config.startingPot <= 0) {
    return "Starting pot must be positive";
  }

  if (config.startingPot > MAX_AMOUNT) {
    return "Starting pot is too large";
  }

  if (config.startingPot % 1 !== 0) {
    return "Starting pot must be an integer";
  }

  if (config.effectiveStack <= 0) {
    return "Effective stack must be positive";
  }

  if (config.effectiveStack > MAX_AMOUNT) {
    return "Effective stack is too large";
  }

  if (config.effectiveStack % 1 !== 0) {
    return "Effective stack is be an integer";
  }

  const betConfig = [
    { s: config.oopFlopBetSanitized, kind: "OOP flop bet" },
    { s: config.oopFlopRaiseSanitized, kind: "OOP flop raise" },
    { s: config.oopTurnBetSanitized, kind: "OOP turn bet" },
    { s: config.oopTurnRaiseSanitized, kind: "OOP turn raise" },
    { s: config.oopRiverBetSanitized, kind: "OOP river bet" },
    { s: config.oopRiverRaiseSanitized, kind: "OOP river raise" },
    { s: config.ipFlopBetSanitized, kind: "IP flop bet" },
    { s: config.ipFlopRaiseSanitized, kind: "IP flop raise" },
    { s: config.ipTurnBetSanitized, kind: "IP turn bet" },
    { s: config.ipTurnRaiseSanitized, kind: "IP turn raise" },
    { s: config.ipRiverBetSanitized, kind: "IP river bet" },
    { s: config.ipRiverRaiseSanitized, kind: "IP river raise" },
  ];

  for (const { s, kind } of betConfig) {
    if (!s.valid) {
      return `${kind}: ${s.s}`;
    }
  }

  if (config.donkOption) {
    if (!config.oopTurnDonkSanitized.valid) {
      return `OOP turn donk: ${config.oopTurnDonkSanitized.s}`;
    }
    if (!config.oopRiverDonkSanitized.valid) {
      return `OOP river donk: ${config.oopRiverDonkSanitized.s}`;
    }
  }

  if (config.addAllInThreshold < 0) {
    return "Invalid add all-in threshold";
  }

  if (config.forceAllInThreshold < 0) {
    return "Invalid force all-in threshold";
  }

  if (config.mergingThreshold < 0) {
    return "Invalid merging threshold";
  }

  if (
    config.expectedBoardLength > 0 &&
    config.board.length !== config.expectedBoardLength
  ) {
    return `Invalid board (expected ${config.expectedBoardLength} cards)`;
  }

  const addedLinesArray =
    config.addedLines === ""
      ? []
      : config.addedLines.split(",").map(readableLineString);

  const removedLinesArray =
    config.removedLines === ""
      ? []
      : config.removedLines.split(",").map(readableLineString);

  if (
    addedLinesArray.includes(ROOT_LINE_STRING) ||
    addedLinesArray.includes(INVALID_LINE_STRING) ||
    removedLinesArray.includes(ROOT_LINE_STRING) ||
    removedLinesArray.includes(INVALID_LINE_STRING)
  ) {
    return "Invalid line found (loaded broken configurations?)";
  }

  if (
    ![0, 3, 4, 5].includes(config.expectedBoardLength) ||
    (config.expectedBoardLength === 0 &&
      (addedLinesArray.length > 0 || removedLinesArray.length > 0)) ||
    (config.expectedBoardLength > 0 &&
      addedLinesArray.length === 0 &&
      removedLinesArray.length === 0)
  ) {
    return "Invalid configurations (loaded broken configurations?)";
  }

  return null;
};

export const useSolverSession = defineStore("solverSession", () => {
  const store = useStore();
  const config = useConfigStore();
  const tmpConfig = useTmpConfigStore();
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
    if (isBunchingActive()) {
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
    store.solutionInfo = null;
    store.isSolutionSaved = false;
    store.solutionDepth = "river";
  };

  const areFlopMatching = () => {
    const flop = savedConfig.board.slice(0, 3);
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

    saveConfigTmp();
    isBuilding.value = true;
    isTreeBuilt.value = false;
    // The game is about to be replaced: hide the old results (and close the lock editor) so
    // no click reaches a game that is not solved. They stay hidden if the build fails.
    store.isSolverFinished = false;
    store.isSolverError = false;
    resetSolutionInfo();

    const errorString = await invokes.gameInit(gameTreeArgs(tmpConfig));

    isBuilding.value = false;
    if (errorString) {
      message.value = errorString;
      return false;
    }

    saveConfig();
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

  /** Memory the solver may use: available memory, or 70% of the total on macOS. */
  const memoryLimit = async () => {
    const [available, total] = await invokes.memory();
    return (await invokes.osName()) === "macos" ? total * 0.7 : available;
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
    if (!(await buildTree())) return false;
    if (!areFlopMatching()) {
      message.value = "The flop and the bunching data do not match.";
      return false;
    }

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
      message.value =
        "Not enough memory for 32-bit precision: solving in 16-bit.";
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
    try {
      await startLockedSolve(lockCompression);
    } catch (e) {
      fail(e);
    }
  };

  const startLockedSolve = async (lockCompression: boolean) => {
    // Before any await: the game is unsolved (also set by the lock editor).
    store.isSolverFinished = false;
    const settingsError = validateSolveSettings(settings.value);
    if (settingsError) {
      fail(settingsError);
      return;
    }
    store.isSolverRunning = true;
    compression.value = lockCompression;
    [memoryNeed32.value, memoryNeed16.value] = await invokes.gameMemoryUsage();
    memoryBunching.value = 0;
    isTreeBuilt.value = true;

    resetSolutionInfo();
    store.isSolverFinished = false;
    store.isSolverPaused = false;
    store.isSolverError = false;
    terminateFlag = false;
    pauseFlag = false;
    elapsedMs.value = 0;
    segmentStart.value = 0;

    iteration.value = 0;
    exploitability.value = Math.max(await invokes.gameExploitability(), 0);
    initialExploitability.value = exploitability.value;
    exploitabilityUpdated = true;
    await resume();
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
        await invokes.setNumThreads(settings.value.threads);
      }

      const target =
        (config.startingPot * settings.value.targetExploitability) / 100;

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
