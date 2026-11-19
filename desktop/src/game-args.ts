// The setup sent to the engine to build a game tree (game_init, game_memory_estimate).

import { convertBetString } from "./utils";
import { BET_FIELDS, type BetFields, isDonkField } from "./bet-fields";

/** The setup fields of the config store. */
export interface ConfigLike extends BetFields {
  board: number[];
  startingPot: number;
  effectiveStack: number;
  rakePercent: number;
  rakeCap: number;
  donkOption: boolean;
  addAllInThreshold: number;
  forceAllInThreshold: number;
  mergingThreshold: number;
  addedLines: string;
  removedLines: string;
}

/** Mirrors `GameTreeArgs` in solver.rs. */
export interface GameTreeArgs extends BetFields {
  board: number[];
  startingPot: number;
  effectiveStack: number;
  rakeRate: number;
  rakeCap: number;
  donkOption: boolean;
  addAllinThreshold: number;
  forceAllinThreshold: number;
  mergingThreshold: number;
  addedLines: string;
  removedLines: string;
}

export const gameTreeArgs = (c: ConfigLike): GameTreeArgs => {
  // Donk sizes only count with the donk option.
  const bets = Object.fromEntries(
    BET_FIELDS.map((field) => [
      field,
      isDonkField(field) && !c.donkOption ? "" : convertBetString(c[field]),
    ])
  ) as BetFields;
  return {
    board: [...c.board],
    startingPot: c.startingPot,
    effectiveStack: c.effectiveStack,
    rakeRate: c.rakePercent / 100,
    rakeCap: c.rakeCap,
    donkOption: c.donkOption,
    ...bets,
    addAllinThreshold: c.addAllInThreshold / 100,
    forceAllinThreshold: c.forceAllInThreshold / 100,
    mergingThreshold: c.mergingThreshold / 100,
    addedLines: c.addedLines,
    removedLines: c.removedLines,
  };
};
