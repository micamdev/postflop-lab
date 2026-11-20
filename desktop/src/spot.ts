// Spots: a heads-up preflop situation at the start of the flop (both ranges, pot, stack,
// rake and the line that led there), saved in the explorer's Spots tab.

/** A saved spot (amounts in tenths of a big blind, as the Setup). */
export type SpotValue = {
  oopRange: string;
  ipRange: string;
  startingPot: number;
  effectiveStack: number;
  rakePercent: number;
  rakeCap: number;
  /** The preflop line, e.g. "BTN 2.5 · BB 13.5 · BTN call". */
  line: string;
  /** The OOP player's position, then the IP player's. */
  positions: [string, string];
};

/** The spot loaded in the Setup. */
export type LoadedSpot = {
  /** Its explorer path; empty once it was deleted from the explorer. */
  path: string[];
  name: string;
  value: SpotValue;
  /** A range was changed since the spot was loaded (stays until it is reloaded). */
  rangesEdited: boolean;
};

/** What a solution keeps of its spot. */
export type SpotRecord = {
  name: string;
  line: string;
  positions: [string, string];
  /** The setup no longer matched the spot when the solve started. */
  modified: boolean;
};

/** The Setup fields a spot owns: trees loaded over a spot leave them alone. */
export const SPOT_FIELDS = [
  "startingPot",
  "effectiveStack",
  "rakePercent",
  "rakeCap",
] as const;

export type SpotNumbers = Record<(typeof SPOT_FIELDS)[number], number>;

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isPositions = (v: unknown): v is [string, string] =>
  Array.isArray(v) && v.length === 2 && v.every((p) => typeof p === "string");

/** Null if `value` is a valid spot, else why not. */
export const checkSpotValue = (value: unknown): string | null => {
  if (!isObject(value)) return "not a spot";
  for (const range of ["oopRange", "ipRange"] as const) {
    const v = value[range];
    if (typeof v !== "string" || v.trim() === "") return `no ${range}`;
  }
  const number = (field: string) => {
    const v = value[field];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  for (const field of ["startingPot", "effectiveStack"]) {
    const v = number(field);
    if (v === null || v <= 0) return `${field} must be a positive number`;
  }
  const rake = number("rakePercent");
  if (rake === null || rake < 0 || rake > 100) {
    return "rakePercent must be between 0 and 100";
  }
  const cap = number("rakeCap");
  if (cap === null || cap < 0) return "rakeCap must be 0 or more";
  if (typeof value.line !== "string") return "no line";
  if (!isPositions(value.positions)) return "positions must be two names";
  return null;
};

/** Whether the setup no longer matches `spot`. */
export const isSpotModified = (spot: LoadedSpot, setup: SpotNumbers) =>
  spot.rangesEdited ||
  SPOT_FIELDS.some((field) => setup[field] !== spot.value[field]);

export const spotRecord = (
  spot: LoadedSpot,
  setup: SpotNumbers
): SpotRecord => ({
  name: spot.name,
  line: spot.value.line,
  positions: [...spot.value.positions],
  modified: isSpotModified(spot, setup),
});

/** A solution's saved spot (`tree_config.spot`), or null if absent or not one. */
export const readSpotRecord = (value: unknown): SpotRecord | null => {
  if (!isObject(value)) return null;
  const { name, line, positions, modified } = value;
  if (
    typeof name !== "string" ||
    typeof line !== "string" ||
    !isPositions(positions) ||
    typeof modified !== "boolean"
  ) {
    return null;
  }
  return { name, line, positions: [...positions], modified };
};

/** `275` → "27.5bb" (amounts are in tenths of a big blind). */
export const toBigBlinds = (amount: number) => `${amount / 10}bb`;
