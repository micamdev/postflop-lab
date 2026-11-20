import { defineStore } from "pinia";
import type { NodeLock } from "./invokes";
import type { LoadedSpot, SpotRecord } from "./spot";

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

/** The setup fields (board, stacks, bet sizes, tree options), all zero or empty. */
export const emptySetup = () => ({
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
});

export type SetupState = ReturnType<typeof emptySetup>;

/** A copy of the setup being edited (the board array included). */
export const snapshotSetup = (): SetupState => {
  const config = useConfigStore();
  return { ...config.$state, board: [...config.board] };
};

/** Records `setup` as the setup of the tree in memory (built or loaded). */
export const setSavedSetup = (setup: SetupState) => {
  useSavedConfigStore().$patch({ ...setup, board: [...setup.board] });
};

export const useStore = defineStore("app", {
  state: () => ({
    navView: "library" as NavView,
    sideView: "main" as SideView,
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
    /** Engine index (2–5) of the bunching fold range being edited, or null. */
    editedFoldRange: null as number | null,
    /** An internal error to show the user (see internal-error.ts), or "". */
    appError: "",
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
    /** The spot loaded from the explorer (it owns the pot, the stack and the rake). */
    spot: null as LoadedSpot | null,
    /** Incremented when a spot is loaded: open range edits end. */
    spotLoadCount: 0,
    /** The spot of the solution in memory, as saved with it (null if none). */
    solvedSpot: null as SpotRecord | null,
    /** Where the tree config comes from (explorer path), null if typed or loaded. */
    treeSource: null as RangeSource | null,
    /** JSON of the saved tree value `treeSource` was loaded from (see tree-source.ts). */
    treeSourceValue: null as string | null,
    /** Locks the current solution was solved with. */
    solutionLocks: [] as NodeLock[],
    /** Locks for the next re-solve: the solution's locks plus pending changes. */
    locks: [] as NodeLock[],
  }),
});

export const useConfigStore = defineStore("config", {
  state: () => ({
    ...emptySetup(),
    // A single raised pot at 100bb (in tenths of a big blind: amounts are integers) with the
    // usual sizes, so a first solve only needs ranges and a board. Clear empties it all.
    startingPot: 55,
    effectiveStack: 975,
    oopFlopBet: "33, 75",
    oopFlopRaise: "60",
    ipFlopBet: "33, 75",
    ipFlopRaise: "60",
    oopTurnBet: "75",
    oopTurnRaise: "60",
    ipTurnBet: "75",
    ipTurnRaise: "60",
    oopRiverBet: "75",
    oopRiverRaise: "60",
    ipRiverBet: "75",
    ipRiverRaise: "60",
    addAllInThreshold: 150,
    forceAllInThreshold: 20,
    mergingThreshold: 10,
  }),
});

/** The setup of the tree in memory: the one the results, the saves and the solve target use. */
export const useSavedConfigStore = defineStore("savedConfig", {
  state: emptySetup,
});

/** Sets the locks of the current solution; pending lock changes are dropped. */
export const setSolutionLocks = (locks: NodeLock[]) => {
  const store = useStore();
  store.solutionLocks = locks;
  store.locks = [...locks];
};
