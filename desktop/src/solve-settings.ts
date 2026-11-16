// Solve settings that rarely change, remembered between launches.

export type Precision = "32" | "16";

export interface SolveSettings {
  threads: number;
  precision: Precision;
  /** Target exploitability, in % of the pot. */
  targetExploitability: number;
  maxIterations: number;
}

export const SETTINGS_KEY = "postflop-lab.solve-settings.v1";

const isInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);

const threadsError = (n: unknown) =>
  isInt(n) && n >= 1 && n <= 64
    ? null
    : "Threads must be a whole number from 1 to 64.";
const targetError = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n > 0
    ? null
    : "Target exploitability must be above 0.";
const iterationsError = (n: unknown) =>
  isInt(n) && n >= 0 && n <= 100000
    ? null
    : "Max iterations must be a whole number from 0 to 100000.";
const precisionError = (p: unknown) =>
  p === "32" || p === "16" ? null : "Unknown precision.";

export const defaultSolveSettings = (
  hardwareThreads: number
): SolveSettings => ({
  threads: Math.min(64, Math.max(1, Math.floor(hardwareThreads) || 1)),
  precision: "32",
  targetExploitability: 0.3,
  maxIterations: 1000,
});

/** Human-readable reason why `s` cannot be used, or null. */
export const validateSolveSettings = (s: SolveSettings): string | null =>
  threadsError(s.threads) ??
  precisionError(s.precision) ??
  targetError(s.targetExploitability) ??
  iterationsError(s.maxIterations);

/** Remembered settings; each missing or invalid field falls back to its default. */
export const loadSolveSettings = (
  storage: Pick<Storage, "getItem">,
  hardwareThreads: number
): SolveSettings => {
  const settings = defaultSolveSettings(hardwareThreads);
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SETTINGS_KEY) ?? "{}");
    if (parsed && typeof parsed === "object") {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    return settings;
  }
  if (threadsError(stored.threads) === null)
    settings.threads = stored.threads as number;
  if (precisionError(stored.precision) === null) {
    settings.precision = stored.precision as Precision;
  }
  if (targetError(stored.targetExploitability) === null) {
    settings.targetExploitability = stored.targetExploitability as number;
  }
  if (iterationsError(stored.maxIterations) === null) {
    settings.maxIterations = stored.maxIterations as number;
  }
  return settings;
};

export const saveSolveSettings = (
  storage: Pick<Storage, "setItem">,
  s: SolveSettings
): void => {
  storage.setItem(SETTINGS_KEY, JSON.stringify(s));
};
