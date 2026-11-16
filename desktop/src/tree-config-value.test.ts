import { describe, expect, test } from "vitest";
import {
  TreeConfigState,
  applyConfigValue,
  hasManualEdits,
  configToValue,
} from "./tree-config-value";
import { sanitizeBetString } from "./utils";

const state = (overrides: Partial<TreeConfigState> = {}): TreeConfigState => ({
  startingPot: 20,
  effectiveStack: 100,
  rakePercent: 5,
  rakeCap: 3,
  donkOption: true,
  oopFlopBet: "33, 75",
  oopFlopRaise: "3x",
  oopTurnBet: "50",
  oopTurnRaise: "",
  oopTurnDonk: "25",
  oopRiverBet: "75",
  oopRiverRaise: "",
  oopRiverDonk: "50",
  ipFlopBet: "50",
  ipFlopRaise: "",
  ipTurnBet: "",
  ipTurnRaise: "",
  ipRiverBet: "",
  ipRiverRaise: "",
  addAllInThreshold: 150,
  forceAllInThreshold: 20,
  mergingThreshold: 10,
  expectedBoardLength: 0,
  addedLines: "",
  removedLines: "",
  ...overrides,
});

describe("tree-config values", () => {
  test("round trip", () => {
    const source = state();
    const target = state({
      startingPot: 1,
      donkOption: false,
      oopFlopBet: "",
      mergingThreshold: 0,
    });
    applyConfigValue(target, configToValue(source));
    expect(target).toEqual(source);
  });

  test("the donk option is stored as a number, donk sizes only when on", () => {
    expect(configToValue(state()).donkOption).toBe(1);
    const off = configToValue(state({ donkOption: false }));
    expect(off.donkOption).toBe(0);
    expect(off.oopTurnDonk).toBe("");
  });

  test("valid bets are sanitized, invalid ones kept as typed", () => {
    const target = state();
    applyConfigValue(target, {
      ...configToValue(state()),
      oopFlopBet: "33,75",
      ipFlopBet: "50,abc",
    });
    expect(target.oopFlopBet).toBe(sanitizeBetString("33,75", false).s);
    expect(target.ipFlopBet).toBe("50,abc");
  });
});

describe("hasManualEdits", () => {
  test("a tree with added or removed lines", () => {
    expect(hasManualEdits(state())).toBe(false);
    expect(hasManualEdits(state({ addedLines: "B30" }))).toBe(true);
    expect(hasManualEdits(state({ removedLines: "X-B30" }))).toBe(true);
  });
});
