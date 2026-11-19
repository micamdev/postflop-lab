// Tree configs as saved in the library of configurations (IndexedDB `configurations`).

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

/** Loads a saved value into `c`; bet sizes are sanitized when valid, else kept as saved. */
export const applyConfigValue = (c: TreeConfigState, value: unknown): void => {
  const v = value as ConfigValue;
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
};

/**
 * The tree has lines added or removed by hand: they encode exact amounts, so pot, stack and
 * bet sizes cannot change without breaking them (only "Edit tree" can).
 */
export const hasManualEdits = (
  c: Pick<TreeConfigState, "addedLines" | "removedLines">
): boolean => c.addedLines !== "" || c.removedLines !== "";
