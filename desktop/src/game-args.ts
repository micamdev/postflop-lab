// The setup sent to the engine to build a game tree (game_init, game_memory_estimate).

import { convertBetString } from "./utils";

/** The setup fields of the config store. */
export interface ConfigLike {
  board: number[];
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
  addedLines: string;
  removedLines: string;
}

/** Mirrors `GameTreeArgs` in solver.rs. */
export interface GameTreeArgs {
  board: number[];
  startingPot: number;
  effectiveStack: number;
  rakeRate: number;
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
  addAllinThreshold: number;
  forceAllinThreshold: number;
  mergingThreshold: number;
  addedLines: string;
  removedLines: string;
}

export const gameTreeArgs = (c: ConfigLike): GameTreeArgs => {
  const donk = (s: string) => (c.donkOption ? convertBetString(s) : "");
  return {
    board: [...c.board],
    startingPot: c.startingPot,
    effectiveStack: c.effectiveStack,
    rakeRate: c.rakePercent / 100,
    rakeCap: c.rakeCap,
    donkOption: c.donkOption,
    oopFlopBet: convertBetString(c.oopFlopBet),
    oopFlopRaise: convertBetString(c.oopFlopRaise),
    oopTurnBet: convertBetString(c.oopTurnBet),
    oopTurnRaise: convertBetString(c.oopTurnRaise),
    oopTurnDonk: donk(c.oopTurnDonk),
    oopRiverBet: convertBetString(c.oopRiverBet),
    oopRiverRaise: convertBetString(c.oopRiverRaise),
    oopRiverDonk: donk(c.oopRiverDonk),
    ipFlopBet: convertBetString(c.ipFlopBet),
    ipFlopRaise: convertBetString(c.ipFlopRaise),
    ipTurnBet: convertBetString(c.ipTurnBet),
    ipTurnRaise: convertBetString(c.ipTurnRaise),
    ipRiverBet: convertBetString(c.ipRiverBet),
    ipRiverRaise: convertBetString(c.ipRiverRaise),
    addAllinThreshold: c.addAllInThreshold / 100,
    forceAllinThreshold: c.forceAllInThreshold / 100,
    mergingThreshold: c.mergingThreshold / 100,
    addedLines: c.addedLines,
    removedLines: c.removedLines,
  };
};
