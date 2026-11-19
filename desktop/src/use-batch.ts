// The batch solve in progress: the Setup's spot solved on a flop subset, each flop saved in the
// library (see batch-plan.ts and the Rust `batch` module).

import { defineStore } from "pinia";
import { ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { snapshotSetup, useConfigStore } from "./store";
import { useSolverSession } from "./solver-session";
import { useSolverBusy } from "./solver-busy";
import { gameTreeArgs } from "./game-args";
import { setupErrors } from "./setup-validation";
import { validateSolveSettings } from "./solve-settings";
import { representativeFlops } from "./flop-subsets";
import { planBatch, BatchFlop } from "./batch-plan";
import { configKey } from "./flop-report";
import * as invokes from "./invokes";

/** What the batch would solve for the current Setup and library, or why it cannot. */
export type BatchPreview =
  | {
      ok: true;
      toSolve: BatchFlop[];
      skipped: number;
      key: string;
      size: number;
    }
  | { ok: false; error: string };

export const useBatch = defineStore("batch", () => {
  const config = useConfigStore();
  const session = useSolverSession();

  const isRunning = ref(false);
  const progress = ref<invokes.BatchProgress | null>(null);
  const result = ref<invokes.BatchResult | null>(null);
  /** Config key of the last batch: its report can be opened from the Library. */
  const lastKey = ref<string | null>(null);

  /** Another operation holds the solver (the batch would compete for CPU and memory). */
  const isSolverBusy = useSolverBusy();

  /** The flops of a subset of `size` still to solve for the Setup's spot. */
  const preview = async (
    size: number,
    prefix: string,
    entries: invokes.LibraryEntry[]
  ): Promise<BatchPreview> => {
    const settingsError = validateSolveSettings(session.settings);
    if (settingsError) return { ok: false, error: settingsError };
    const first = Object.values(setupErrors(config)).flat()[0];
    if (first) return { ok: false, error: first };
    if (config.expectedBoardLength > 3) {
      return {
        ok: false,
        error:
          "The tree was edited for a turn or river board: a batch needs a flop tree.",
      };
    }
    const ranges = [
      await invokes.rangeToString(0),
      await invokes.rangeToString(1),
    ];
    if (ranges.some((r) => r === "")) {
      return { ok: false, error: "Both ranges must not be empty." };
    }
    const key = configKey({
      ranges,
      tree_config: { ...snapshotSetup() },
      locks: [],
    } as unknown as invokes.SolutionMeta);
    const plan = planBatch(
      entries,
      key,
      representativeFlops(size),
      size,
      prefix
    );
    return { ok: true, ...plan, key, size };
  };

  /** Solves the flops of `plan` (from `preview`) and saves them at `depth`. */
  const start = async (
    plan: Extract<BatchPreview, { ok: true }>,
    depth: string
  ) => {
    if (isRunning.value || isSolverBusy.value || plan.toSolve.length === 0) {
      return;
    }
    isRunning.value = true;
    result.value = null;
    progress.value = null;
    lastKey.value = plan.key;
    const unlisten = await listen<invokes.BatchProgress>(
      "batch-progress",
      (event) => (progress.value = event.payload)
    );
    try {
      const setup = snapshotSetup();
      result.value = await invokes.batchSolve({
        args: gameTreeArgs(setup),
        treeConfig: { ...setup },
        flops: plan.toSolve,
        subsetSize: plan.size,
        settings: {
          precision: session.settings.precision,
          targetExploitability: session.settings.targetExploitability,
          maxIterations: session.settings.maxIterations,
        },
        depth,
      });
    } catch (e) {
      result.value = { solved: 0, failed: [String(e)], cancelled: false };
    } finally {
      unlisten();
      isRunning.value = false;
      progress.value = null;
    }
  };

  const stop = () => void invokes.batchCancel();

  return {
    isRunning,
    progress,
    result,
    lastKey,
    isSolverBusy,
    preview,
    start,
    stop,
  };
});
