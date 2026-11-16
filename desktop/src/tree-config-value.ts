// Tree configs as saved in the library of configurations (IndexedDB `configurations`).

import { sanitizeBetString } from "./utils";

/** The tree fields of the config store. */
export interface TreeConfigState {
  startingPot: number;
  effectiveStack: number;
  rakePercent: number;
  rakeCap: number;
  donkOption: boolean;
  oopFlopBet: string;
  oopFlopRaise: string;
  oopTurnBet: string;
  oopTurnRaise: string;
  oopTurnDonk: string;
  oopRiverBet: string;
  oopRiverRaise: string;
  oopRiverDonk: string;
  ipFlopBet: string;
  ipFlopRaise: string;
  ipTurnBet: string;
  ipTurnRaise: string;
  ipRiverBet: string;
  ipRiverRaise: string;
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

const BET_FIELDS = [
  "oopFlopBet",
  "oopFlopRaise",
  "oopTurnBet",
  "oopTurnRaise",
  "oopTurnDonk",
  "oopRiverBet",
  "oopRiverRaise",
  "oopRiverDonk",
  "ipFlopBet",
  "ipFlopRaise",
  "ipTurnBet",
  "ipTurnRaise",
  "ipRiverBet",
  "ipRiverRaise",
] as const;

export const configToValue = (c: TreeConfigState): ConfigValue => ({
  startingPot: c.startingPot,
  effectiveStack: c.effectiveStack,
  rakePercent: c.rakePercent,
  rakeCap: c.rakeCap,
  donkOption: Number(c.donkOption),
  oopFlopBet: c.oopFlopBet,
  oopFlopRaise: c.oopFlopRaise,
  oopTurnBet: c.oopTurnBet,
  oopTurnRaise: c.oopTurnRaise,
  oopTurnDonk: c.donkOption ? c.oopTurnDonk : "",
  oopRiverBet: c.oopRiverBet,
  oopRiverRaise: c.oopRiverRaise,
  oopRiverDonk: c.donkOption ? c.oopRiverDonk : "",
  ipFlopBet: c.ipFlopBet,
  ipFlopRaise: c.ipFlopRaise,
  ipTurnBet: c.ipTurnBet,
  ipTurnRaise: c.ipTurnRaise,
  ipRiverBet: c.ipRiverBet,
  ipRiverRaise: c.ipRiverRaise,
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
    const sanitized = sanitizeBetString(str, field.endsWith("Raise"));
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
