import { defineStore } from "pinia";
import { sanitizeBetString } from "./utils";
import type { NodeLock } from "./invokes";

export type NavView = "setup" | "results" | "library";

/** Page shown in Setup. */
export type SideView = "main" | "tree-config" | "bunching";

/** A saved range or tree config the setup was loaded from. */
export type RangeSource = { path: string[]; modified: boolean };

/** Saved depth of a solution: complete ("river"), up to the turn, or flop only. */
export type SolutionDepth = "river" | "turn" | "flop";

/** The solution currently in memory, solved in this session or loaded from the library. */
export type SolutionInfo = {
  /** Library name, or null if solved in this session. */
  name: string | null;
  /** Whether it was loaded from the library (not solved in this session). */
  loaded: boolean;
  iterations: number;
  exploitability: number;
};

export const saveConfigTmp = () => {
  const config = useConfigStore();
  const tmpConfig = useTmpConfigStore();

  tmpConfig.$patch({
    board: [...config.board],
    startingPot: config.startingPot,
    effectiveStack: config.effectiveStack,
    rakePercent: config.rakePercent,
    rakeCap: config.rakeCap,
    donkOption: config.donkOption,
    oopFlopBet: config.oopFlopBet,
    oopFlopRaise: config.oopFlopRaise,
    oopTurnBet: config.oopTurnBet,
    oopTurnRaise: config.oopTurnRaise,
    oopTurnDonk: config.oopTurnDonk,
    oopRiverBet: config.oopRiverBet,
    oopRiverRaise: config.oopRiverRaise,
    oopRiverDonk: config.oopRiverDonk,
    ipFlopBet: config.ipFlopBet,
    ipFlopRaise: config.ipFlopRaise,
    ipTurnBet: config.ipTurnBet,
    ipTurnRaise: config.ipTurnRaise,
    ipRiverBet: config.ipRiverBet,
    ipRiverRaise: config.ipRiverRaise,
    addAllInThreshold: config.addAllInThreshold,
    forceAllInThreshold: config.forceAllInThreshold,
    mergingThreshold: config.mergingThreshold,
    expectedBoardLength: config.expectedBoardLength,
    addedLines: config.addedLines,
    removedLines: config.removedLines,
  });
};

export const saveConfig = () => {
  const tmpConfig = useTmpConfigStore();
  const savedConfig = useSavedConfigStore();

  savedConfig.$patch({
    board: tmpConfig.board,
    startingPot: tmpConfig.startingPot,
    effectiveStack: tmpConfig.effectiveStack,
    rakePercent: tmpConfig.rakePercent,
    rakeCap: tmpConfig.rakeCap,
    donkOption: tmpConfig.donkOption,
    oopFlopBet: tmpConfig.oopFlopBet,
    oopFlopRaise: tmpConfig.oopFlopRaise,
    oopTurnBet: tmpConfig.oopTurnBet,
    oopTurnRaise: tmpConfig.oopTurnRaise,
    oopTurnDonk: tmpConfig.oopTurnDonk,
    oopRiverBet: tmpConfig.oopRiverBet,
    oopRiverRaise: tmpConfig.oopRiverRaise,
    oopRiverDonk: tmpConfig.oopRiverDonk,
    ipFlopBet: tmpConfig.ipFlopBet,
    ipFlopRaise: tmpConfig.ipFlopRaise,
    ipTurnBet: tmpConfig.ipTurnBet,
    ipTurnRaise: tmpConfig.ipTurnRaise,
    ipRiverBet: tmpConfig.ipRiverBet,
    ipRiverRaise: tmpConfig.ipRiverRaise,
    addAllInThreshold: tmpConfig.addAllInThreshold,
    forceAllInThreshold: tmpConfig.forceAllInThreshold,
    mergingThreshold: tmpConfig.mergingThreshold,
    expectedBoardLength: tmpConfig.expectedBoardLength,
    addedLines: tmpConfig.addedLines,
    removedLines: tmpConfig.removedLines,
  });
};

export const useStore = defineStore("app", {
  state: () => ({
    navView: "library" as NavView,
    sideView: "main" as SideView,
    headers: {
      main: ["Setup"],
      "tree-config": ["Tree Configuration"],
      bunching: ["Bunching Effect"],
    },
    ranges: Array.from({ length: 6 }, () =>
      Array.from({ length: 13 * 13 }, () => 0)
    ),
    isBunchingEnabled: false,
    isBunchingRunning: false,
    bunchingFlop: [] as number[],
    isSolverRunning: false,
    isSolverPaused: false,
    isSolverFinished: false,
    isSolverError: false,
    isFinalizing: false,
    solutionDepth: "river" as SolutionDepth,
    solutionInfo: null as SolutionInfo | null,
    /** Line shown in Results (for a re-solve with locks started from the top bar). */
    currentLine: null as { history: number[]; label: string } | null,
    /** The save dialog of the top bar is open. */
    isSaveDialogOpen: false,
    /** Line (history) to show in Results once the locked solve ends. */
    returnLine: null as number[] | null,
    isSolutionSaved: false,
    /** A library operation (load) holds the game: solver controls are locked. */
    isLibraryBusy: false,
    /** A solve is starting (tree build, memory checks, allocation): nothing else may touch the game. */
    isSolveStarting: false,
    /** Incremented when the game no longer matches the tree built in Run Solver. */
    treeResetCount: 0,
    /** Incremented after a solution is loaded: range and board texts refresh. */
    solutionLoadCount: 0,
    /** Where the OOP and IP ranges come from (explorer path), null if typed or loaded. */
    rangeSources: [null, null] as [RangeSource | null, RangeSource | null],
    /** Where the tree config comes from (explorer path), null if typed or loaded. */
    treeSource: null as RangeSource | null,
    /** Locks the current solution was solved with. */
    solutionLocks: [] as NodeLock[],
    /** Locks for the next re-solve: the solution's locks plus pending changes. */
    locks: [] as NodeLock[],
  }),

  getters: {
    hasSolverRun: (state) => {
      return (
        state.isSolverRunning ||
        state.isSolverPaused ||
        state.isSolverFinished ||
        state.isSolverError ||
        state.isFinalizing
      );
    },
  },
});

export const useConfigStore = defineStore("config", {
  state: () => ({
    board: [] as number[],
    startingPot: 20,
    effectiveStack: 100,
    rakePercent: 0,
    rakeCap: 0,
    donkOption: false,
    oopFlopBet: "",
    oopFlopRaise: "",
    oopTurnBet: "",
    oopTurnRaise: "",
    oopTurnDonk: "",
    oopRiverBet: "",
    oopRiverRaise: "",
    oopRiverDonk: "",
    ipFlopBet: "",
    ipFlopRaise: "",
    ipTurnBet: "",
    ipTurnRaise: "",
    ipRiverBet: "",
    ipRiverRaise: "",
    addAllInThreshold: 150,
    forceAllInThreshold: 20,
    mergingThreshold: 10,
    expectedBoardLength: 0,
    addedLines: "",
    removedLines: "",
  }),

  getters: {
    oopFlopBetSanitized: (s) => sanitizeBetString(s.oopFlopBet, false),
    oopFlopRaiseSanitized: (s) => sanitizeBetString(s.oopFlopRaise, true),
    oopTurnBetSanitized: (s) => sanitizeBetString(s.oopTurnBet, false),
    oopTurnRaiseSanitized: (s) => sanitizeBetString(s.oopTurnRaise, true),
    oopTurnDonkSanitized: (s) => sanitizeBetString(s.oopTurnDonk, false),
    oopRiverBetSanitized: (s) => sanitizeBetString(s.oopRiverBet, false),
    oopRiverRaiseSanitized: (s) => sanitizeBetString(s.oopRiverRaise, true),
    oopRiverDonkSanitized: (s) => sanitizeBetString(s.oopRiverDonk, false),
    ipFlopBetSanitized: (s) => sanitizeBetString(s.ipFlopBet, false),
    ipFlopRaiseSanitized: (s) => sanitizeBetString(s.ipFlopRaise, true),
    ipTurnBetSanitized: (s) => sanitizeBetString(s.ipTurnBet, false),
    ipTurnRaiseSanitized: (s) => sanitizeBetString(s.ipTurnRaise, true),
    ipRiverBetSanitized: (s) => sanitizeBetString(s.ipRiverBet, false),
    ipRiverRaiseSanitized: (s) => sanitizeBetString(s.ipRiverRaise, true),
  },
});

export const useTmpConfigStore = defineStore("tmpConfig", {
  state: () => ({
    board: [] as number[],
    startingPot: 0,
    effectiveStack: 0,
    rakePercent: 0,
    rakeCap: 0,
    donkOption: false,
    oopFlopBet: "",
    oopFlopRaise: "",
    oopTurnBet: "",
    oopTurnRaise: "",
    oopTurnDonk: "",
    oopRiverBet: "",
    oopRiverRaise: "",
    oopRiverDonk: "",
    ipFlopBet: "",
    ipFlopRaise: "",
    ipTurnBet: "",
    ipTurnRaise: "",
    ipRiverBet: "",
    ipRiverRaise: "",
    addAllInThreshold: 0,
    forceAllInThreshold: 0,
    mergingThreshold: 0,
    expectedBoardLength: 0,
    addedLines: "",
    removedLines: "",
  }),
});

export const useSavedConfigStore = defineStore("savedConfig", {
  state: () => ({
    board: [] as number[],
    startingPot: 0,
    effectiveStack: 0,
    rakePercent: 0,
    rakeCap: 0,
    donkOption: false,
    oopFlopBet: "",
    oopFlopRaise: "",
    oopTurnBet: "",
    oopTurnRaise: "",
    oopTurnDonk: "",
    oopRiverBet: "",
    oopRiverRaise: "",
    oopRiverDonk: "",
    ipFlopBet: "",
    ipFlopRaise: "",
    ipTurnBet: "",
    ipTurnRaise: "",
    ipRiverBet: "",
    ipRiverRaise: "",
    addAllInThreshold: 0,
    forceAllInThreshold: 0,
    mergingThreshold: 0,
    expectedBoardLength: 0,
    addedLines: "",
    removedLines: "",
  }),
});

/** Sets the locks of the current solution; pending lock changes are dropped. */
export const setSolutionLocks = (locks: NodeLock[]) => {
  const store = useStore();
  store.solutionLocks = locks;
  store.locks = [...locks];
};
