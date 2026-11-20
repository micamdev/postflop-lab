// Tree configs as saved in the library of configurations (IndexedDB `configurations`).

import { SPOT_FIELDS } from "./spot";
import { sanitizeBetString } from "./utils";
import {
  BET_FIELDS,
  type BetFields,
  isDonkField,
  isRaiseField,
} from "./bet-fields";

/** The tree fields of the config store. */
export interface TreeConfigState extends BetFields {
  startingPot: number;
  effectiveStack: number;
  rakePercent: number;
  rakeCap: number;
  donkOption: boolean;
  addAllInThreshold: number;
  forceAllInThreshold: number;
  mergingThreshold: number;
  expectedBoardLength: number;
  addedLines: string;
  removedLines: string;
}

/** Saved form: as `TreeConfigState`, with the donk option as 0 or 1. */
export type ConfigValue = Omit<TreeConfigState, "donkOption"> & {
  donkOption: number;
};

export const configToValue = (c: TreeConfigState): ConfigValue => ({
  startingPot: c.startingPot,
  effectiveStack: c.effectiveStack,
  rakePercent: c.rakePercent,
  rakeCap: c.rakeCap,
  donkOption: Number(c.donkOption),
  // Same key order as before (saved values are compared as JSON); donk sizes only with the
  // donk option.
  ...(Object.fromEntries(
    BET_FIELDS.map((field) => [
      field,
      isDonkField(field) && !c.donkOption ? "" : c[field],
    ])
  ) as BetFields),
  addAllInThreshold: c.addAllInThreshold,
  forceAllInThreshold: c.forceAllInThreshold,
  mergingThreshold: c.mergingThreshold,
  expectedBoardLength: c.expectedBoardLength,
  addedLines: c.addedLines,
  removedLines: c.removedLines,
});

/**
 * Loads a saved value into `c`; bet sizes are sanitized when valid, else kept as saved. The
 * fields in `keep` stay as they are (a spot's pot, stack and rake under a loaded tree).
 */
export const applyConfigValue = (
  c: TreeConfigState,
  value: unknown,
  keep: readonly (keyof TreeConfigState)[] = []
): void => {
  const v = value as ConfigValue;
  const kept = Object.fromEntries(keep.map((field) => [field, c[field]]));
  c.startingPot = Number(v.startingPot);
  c.effectiveStack = Number(v.effectiveStack);
  c.rakePercent = Number(v.rakePercent);
  c.rakeCap = Number(v.rakeCap);
  c.donkOption = Boolean(v.donkOption);
  c.addAllInThreshold = Number(v.addAllInThreshold);
  c.forceAllInThreshold = Number(v.forceAllInThreshold);
  c.mergingThreshold = Number(v.mergingThreshold);
  c.expectedBoardLength = Number(v.expectedBoardLength);
  c.addedLines = String(v.addedLines);
  c.removedLines = String(v.removedLines);

  for (const field of BET_FIELDS) {
    const str = String(v[field]);
    const sanitized = sanitizeBetString(str, isRaiseField(field));
    c[field] = sanitized.valid ? sanitized.s : str;
  }
  Object.assign(c, kept);
};

/**
 * The tree has lines added or removed by hand: they encode exact amounts, so pot, stack and
 * bet sizes cannot change without breaking them (only "Edit tree" can).
 */
export const hasManualEdits = (
  c: Pick<TreeConfigState, "addedLines" | "removedLines">
): boolean => c.addedLines !== "" || c.removedLines !== "";

/**
 * `value` with the pot, stack and rake of `saved` (a saved tree overwritten while a spot is
 * loaded: the spot's numbers must not leak into it).
 */
export const keepSpotFields = (
  value: ConfigValue,
  saved: unknown
): ConfigValue => {
  const s = saved as Partial<ConfigValue>;
  const kept = { ...value };
  for (const field of SPOT_FIELDS) {
    if (s[field] !== undefined) kept[field] = Number(s[field]);
  }
  return kept;
};
