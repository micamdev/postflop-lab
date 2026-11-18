// What the top bar shows and offers, derived from the solver state.

import type { Precision } from "./solve-settings";
import { formatBytes } from "./utils";

export interface SolveFlags {
  /** A tree is built or a solution is loaded. */
  hasGame: boolean;
  isSolverRunning: boolean;
  isSolverPaused: boolean;
  isFinalizing: boolean;
  isSolverFinished: boolean;
  isSolverError: boolean;
  isSolutionSaved: boolean;
}

export type StatusTone = "neutral" | "busy" | "warn" | "ok" | "error";

export const solutionStatus = (
  f: SolveFlags
): { label: string; tone: StatusTone } => {
  if (f.isSolverRunning) return { label: "Solving…", tone: "busy" };
  if (f.isFinalizing) return { label: "Finalizing…", tone: "busy" };
  if (f.isSolverPaused) return { label: "Paused", tone: "warn" };
  if (f.isSolverError) return { label: "Error", tone: "error" };
  if (f.hasGame && f.isSolverFinished) {
    return f.isSolutionSaved
      ? { label: "Saved", tone: "ok" }
      : { label: "Not saved", tone: "warn" };
  }
  return { label: "Not solved", tone: "neutral" };
};

export type PrimaryAction = "solve" | "save" | "progress" | "resolve-locks";

export const primaryAction = (
  f: SolveFlags,
  canSave: boolean,
  pendingLocks = false
): PrimaryAction => {
  if (f.isSolverRunning || f.isSolverPaused || f.isFinalizing) {
    return "progress";
  }
  // Its flow offers to save first.
  if (f.isSolverFinished && pendingLocks) return "resolve-locks";
  if (f.isSolverFinished && !f.isSolutionSaved && canSave) return "save";
  return "solve";
};

/** Solve progress in [0, 1]: iterations, or exploitability on a log scale. */
export const progressFraction = (p: {
  iteration: number;
  maxIterations: number;
  initialExploitability: number;
  exploitability: number;
  target: number;
}): number => {
  const byIterations = p.maxIterations > 0 ? p.iteration / p.maxIterations : 0;
  const byExploitability =
    Math.log(p.initialExploitability / p.exploitability) /
    Math.log(p.initialExploitability / p.target);
  const values = [byIterations, byExploitability].filter(Number.isFinite);
  const fraction = values.length > 0 ? Math.max(...values) : 0;
  return Math.min(1, Math.max(0, fraction));
};

export type PrecisionChoice =
  | { ok: true; compression: boolean; fellBack: boolean }
  | { ok: false; message: string };

/** Precision to solve with, given the memory each one needs and what is available. */
export const choosePrecision = (
  preferred: Precision,
  need32: number,
  need16: number,
  available: number,
  ignoreLimit: boolean
): PrecisionChoice => {
  const compression = preferred === "16";
  const need = compression ? need16 : need32;
  if (ignoreLimit || need <= available) {
    return { ok: true, compression, fellBack: false };
  }
  if (need16 <= available)
    return { ok: true, compression: true, fellBack: true };
  return {
    ok: false,
    message: `Needs ${formatBytes(need16)}, ${formatBytes(available)} available`,
  };
};

/** Save stays offered beside "Re-solve with locks" while the solution is unsaved. */
export const savesBeside = (f: SolveFlags, canSave: boolean): boolean =>
  f.isSolverFinished && !f.isSolutionSaved && canSave;
