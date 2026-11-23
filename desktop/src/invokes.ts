import { withNaN } from "./invokes-numbers";
import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";
import { Results, ChanceReports } from "./result-types";
import type { GameTreeArgs } from "./game-args";

/** Prefix of the error a Rust command returns after an internal error (a panic): the game may
 * have been reset (see guard.rs). */
export const ERR_INTERNAL = "Internal error";

let onInternalError: (message: string) => void = () => {};

/** Sets what the app does after an internal error (drop the results, show the message). */
export const setInternalErrorHandler = (handler: (message: string) => void) => {
  onInternalError = handler;
};

// Every command goes through here: internal errors are reported, then rejected as usual.
const invoke = async <T>(cmd: string, args?: InvokeArgs): Promise<T> => {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (e) {
    if (String(e).startsWith(ERR_INTERNAL)) onInternalError(String(e));
    throw e;
  }
};

export const osName = async (): Promise<"windows" | "macos" | "linux"> => {
  return await invoke("os_name");
};

export const memory = async (): Promise<number[]> => {
  return await invoke("memory");
};

export const setNumThreads = async (numThreads: number) => {
  await invoke("set_num_threads", { numThreads });
};

/* Ranges */

export const rangeNumCombos = async (player: number): Promise<number> => {
  return await invoke("range_num_combos", { player });
};

export const rangeClear = async (player: number) => {
  await invoke("range_clear", { player });
};

export const rangeInvert = async (player: number) => {
  await invoke("range_invert", { player });
};

export const rangeUpdate = async (
  player: number,
  row: number,
  col: number,
  weight: number
) => {
  await invoke("range_update", { player, row, col, weight });
};

export const rangeFromString = async (
  player: number,
  str: string
): Promise<string | null> => {
  return await invoke("range_from_string", { player, str });
};

export const rangeToString = async (player: number): Promise<string> => {
  return await invoke("range_to_string", { player });
};

export const rangeGetWeights = async (player: number): Promise<number[]> => {
  return await invoke("range_get_weights", { player });
};

export const rangeRawData = async (player: number): Promise<number[]> => {
  return await invoke("range_raw_data", { player });
};

/* Action Tree */

/** Builds the tree to edit from the setup, starting on the street of `boardLen` (3 to 5). */
export const treeNew = async (
  args: GameTreeArgs,
  boardLen: number
): Promise<boolean> => {
  return await invoke("tree_new", { args, boardLen });
};

export const treeAddedLines = async (): Promise<string> => {
  return await invoke("tree_added_lines");
};

export const treeRemovedLines = async (): Promise<string> => {
  return await invoke("tree_removed_lines");
};

export const treeInvalidTerminals = async (): Promise<string> => {
  return await invoke("tree_invalid_terminals");
};

export const treeActions = async (): Promise<string[]> => {
  return await invoke("tree_actions");
};

export const treeIsTerminalNode = async (): Promise<boolean> => {
  return await invoke("tree_is_terminal_node");
};

export const treeIsChanceNode = async (): Promise<boolean> => {
  return await invoke("tree_is_chance_node");
};

export const treeBackToRoot = async () => {
  await invoke("tree_back_to_root");
};

export const treeApplyHistory = async (line: string[]) => {
  await invoke("tree_apply_history", { line });
};

export const treePlay = async (action: string): Promise<number> => {
  return await invoke("tree_play", { action });
};

export const treeTotalBetAmount = async (): Promise<number[]> => {
  return await invoke("tree_total_bet_amount");
};

export const treeAddBetAction = async (amount: number, isRaise: boolean) => {
  await invoke("tree_add_bet_action", { amount, isRaise });
};

export const treeRemoveCurrentNode = async () => {
  await invoke("tree_remove_current_node");
};

export const treeDeleteAddedLine = async (line: string) => {
  await invoke("tree_delete_added_line", { line });
};

export const treeDeleteRemovedLine = async (line: string) => {
  await invoke("tree_delete_removed_line", { line });
};

/* Bunching effect */

export const bunchingInit = async (board: number[]): Promise<string | null> => {
  return await invoke("bunching_init", { board });
};

export const bunchingClear = async () => {
  await invoke("bunching_clear");
};

export const bunchingProgress = async (): Promise<number[]> => {
  return await invoke("bunching_progress");
};

/* Game */

export const gameInit = async (args: GameTreeArgs): Promise<string | null> => {
  return await invoke("game_init", { args });
};

/** Memory needed to solve the setup [32-bit, 16-bit, added by the bunching effect]; rejects
 * with the reason. */
export const gameMemoryEstimate = async (
  args: GameTreeArgs
): Promise<[number, number, number]> => {
  return await invoke("game_memory_estimate", { args });
};

/** What starting a solve needs, checked on a separate game (the open one is untouched):
 * bytes in 32-bit and 16-bit, added by the bunching effect, and the limit (it counts what the
 * open solution frees). Rejects with the reason, e.g. a tree too large to build. */
export const gameSolveEstimate = async (
  args: GameTreeArgs,
  ignoreLimit: boolean
): Promise<{
  need32: number;
  need16: number;
  bunching: number;
  limit: number;
}> => {
  return await invoke("game_solve_estimate", { args, ignoreLimit });
};

export const gamePrivateCards = async (): Promise<number[][]> => {
  return await invoke("game_private_cards");
};

export const gameMemoryUsage = async (): Promise<number[]> => {
  return await invoke("game_memory_usage");
};

export const gameMemoryUsageBunching = async (): Promise<number> => {
  return await invoke("game_memory_usage_bunching");
};

export const gameAllocateMemory = async (enableCompression: boolean) => {
  await invoke("game_allocate_memory", { enableCompression });
};

export const gameSetBunching = async (): Promise<string | null> => {
  return await invoke("game_set_bunching");
};

export const gameSolveStep = async (currentIteration: number) => {
  await invoke("game_solve_step", { currentIteration });
};

export const gameExploitability = async (): Promise<number> => {
  return await invoke("game_exploitability");
};

export const gameFinalize = async () => {
  await invoke("game_finalize");
};

export const gameApplyHistory = async (history: number[]) => {
  await invoke("game_apply_history", { history });
};

export const gameTotalBetAmount = async (
  append: number[]
): Promise<number[]> => {
  return await invoke("game_total_bet_amount", { append });
};

export const gameActionsAfter = async (append: number[]): Promise<string[]> => {
  return await invoke("game_actions_after", { append });
};

export const gamePossibleCards = async (): Promise<bigint> => {
  return BigInt(await invoke("game_possible_cards"));
};

type ResultsResponse = {
  current_player: "oop" | "ip" | "chance" | "terminal";
  num_actions: number;
  is_empty: number;
  eqr_base: number[];
  weights: number[][];
  normalizer: number[][];
  equity: number[][];
  ev: number[][];
  eqr: number[][];
  strategy: number[];
  action_ev: number[];
};

export const gameGetResults = async (): Promise<Results> => {
  const results: ResultsResponse = await invoke("game_get_results");
  return {
    currentPlayer: results.current_player,
    numActions: results.num_actions,
    isEmpty: results.is_empty,
    eqrBase: results.eqr_base,
    weights: results.weights,
    normalizer: results.normalizer,
    equity: withNaN(results.equity),
    ev: withNaN(results.ev),
    eqr: withNaN(results.eqr),
    strategy: results.strategy,
    actionEv: withNaN([results.action_ev])[0],
  };
};

type ChanceReportsResponse = {
  num_actions: number;
  status: number[];
  combos: number[][];
  equity: number[][];
  ev: number[][];
  eqr: number[][];
  strategy: number[];
};

export const gameGetChanceReports = async (
  append: number[],
  currentPlayer: "oop" | "ip" | "terminal",
  numActions: number
): Promise<ChanceReports> => {
  const reports: ChanceReportsResponse = await invoke(
    "game_get_chance_reports",
    { append, numActions }
  );
  return {
    currentPlayer,
    numActions,
    status: reports.status,
    combos: reports.combos,
    equity: withNaN(reports.equity),
    ev: withNaN(reports.ev),
    eqr: withNaN(reports.eqr),
    strategy: reports.strategy,
  };
};

/* Solution library */

export type SolutionSummary = {
  equity: number[];
  ev: number[];
  root_player: string;
  root_actions: string[];
  root_frequencies: number[];
  /** OOP and IP shares in the equity tranches >= 90%, 75-90%, 50-75%, < 50% (schema 3). */
  equity_buckets?: [number[], number[]] | null;
  /** IP's strategy after OOP checks at the root (schema 3; absent if OOP cannot check). */
  ip_after_check?: { actions: string[]; frequencies: number[] } | null;
};

export type SolutionMeta = {
  schema: number;
  app_version: string;
  /** Seconds since the Unix epoch. */
  created_at: number;
  board: number[];
  ranges: string[];
  tree_config: Record<string, unknown>;
  depth: "river" | "turn" | "flop";
  exploitability: number;
  iterations: number;
  precision: "32" | "16";
  summary: SolutionSummary;
  /** Locks the solution was solved with (absent from schema 1 files). */
  locks?: NodeLock[];
  /** Weight of the flop in the subset it was batch-solved with (absent if solved by hand). */
  flop_weight?: number | null;
  /** Size of the flop subset of the batch that solved it (absent if solved by hand). */
  batch_size?: number | null;
};

export type LibraryEntry = {
  name: string;
  file_size: number;
  meta: SolutionMeta | null;
  error: string | null;
};

/** Error of save, rename and import when the target name is taken. */
export const ERR_EXISTS = "exists";

/** Error prefix of libraryLoad when the current game was already freed. */
export const ERR_GAME_FREED = "game freed";

/** Rejects with a message if the solution cannot be loaded; touches nothing. */
export const libraryCheckLoad = async (name: string) => {
  await invoke("library_check_load", { name });
};

export const gameStorageMode = async (): Promise<"river" | "turn" | "flop"> => {
  return await invoke("game_storage_mode");
};

export const libraryList = async (): Promise<LibraryEntry[]> => {
  return await invoke("library_list");
};

/** For each depth the tree allows: [depth, memory needed to reload in bytes]. */
export const librarySaveEstimate = async (): Promise<[string, number][]> => {
  return await invoke("library_save_estimate");
};

export const librarySave = async (
  name: string,
  depth: string,
  overwrite: boolean,
  frontMeta: {
    treeConfig: Record<string, unknown>;
    iterations: number;
    exploitability: number;
  }
): Promise<string> => {
  // The file name the library used (sanitized).
  return await invoke("library_save", { name, depth, overwrite, frontMeta });
};

/** Recomputes the summary of a saved solution (older saves); returns its new metadata. */
export const libraryRefreshSummary = async (
  name: string
): Promise<SolutionMeta> => {
  return await invoke("library_refresh_summary", { name });
};

export const libraryLoad = async (name: string): Promise<SolutionMeta> => {
  return await invoke("library_load", { name });
};

/** Returns the new file name (sanitized by the library). */
export const libraryRename = async (
  from: string,
  to: string
): Promise<string> => {
  return await invoke("library_rename", { from, to });
};

export const libraryDelete = async (name: string) => {
  await invoke("library_delete", { name });
};

export const libraryImport = async (
  path: string,
  overwrite: boolean
): Promise<string> => {
  return await invoke("library_import", { path, overwrite });
};

export const libraryExport = async (name: string, path: string) => {
  await invoke("library_export", { name, path });
};

export const libraryOpenFolder = async () => {
  await invoke("library_open_folder");
};

/* On-demand river re-solve */

/** Re-solves the river `card` at `history` (a river past the saved depth). */
export const gameResolveSubgame = async (
  history: number[],
  card: number,
  reachedExploitability: number | null
): Promise<"solve" | "empty"> => {
  return await invoke("game_resolve_subgame", {
    history,
    card,
    reachedExploitability,
  });
};

export const gameCancelSubgame = async () => {
  await invoke("game_cancel_subgame");
};

/* Node lock */

/** A lock on one player node: the full strategy of every hand at the node. */
export type NodeLock = {
  /** Line to the node, as played (actions and cards). */
  history: number[];
  /** Same line with the turn replaced by its representative: same key, same node. */
  key: number[];
  player: "oop" | "ip";
  actions: string[];
  /** Frequency of each action, per combo (e.g. "9s6s"); each sums to 1. */
  hands: Record<string, number[]>;
  /** Combos edited by the user; the others keep the strategy at capture time. */
  edited: string[];
  /** Readable line to the node (display only). */
  label: string;
};

/** Captures a lock on the node at `history`, with `edits` (combo → frequencies) applied. */
export const gameCaptureLock = async (
  history: number[],
  edits: Record<string, number[]>
): Promise<NodeLock> => {
  return await invoke("game_capture_lock", { history, edits });
};

/**
 * Replaces the current solution by its tree, rebuilt with `locks` placed (memory allocated).
 * Returns whether the 16-bit precision is used. On error the current solution is untouched.
 */
export const gamePrepareLockSolve = async (
  locks: NodeLock[]
): Promise<boolean> => {
  return await invoke("game_prepare_lock_solve", { locks });
};

/* Batch solving */

export type BatchRequest = {
  /** The Setup's tree arguments (the board is set per flop). */
  args: GameTreeArgs;
  /** The Setup as saved in the metadata (the board is set per flop). */
  treeConfig: Record<string, unknown>;
  flops: { board: number[]; weight: number; name: string }[];
  /** Size of the subset the flops come from (saved with each flop). */
  subsetSize: number;
  settings: {
    precision: string;
    targetExploitability: number;
    maxIterations: number;
  };
  depth: string;
};

export type BatchProgress = {
  index: number;
  total: number;
  name: string;
  iteration: number;
};

export type BatchResult = {
  solved: number;
  /** "name: error" for each flop that failed. */
  failed: string[];
  cancelled: boolean;
};

/** Solves the Setup's spot on each flop and saves them; "batch-progress" events meanwhile. */
export const batchSolve = async (
  request: BatchRequest
): Promise<BatchResult> => {
  return await invoke("batch_solve", { request });
};

/** Stops the batch in progress (the flop being solved is not saved). */
export const batchCancel = async (): Promise<void> => {
  await invoke("batch_cancel");
};
