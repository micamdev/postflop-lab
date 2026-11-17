import { describe, expect, test } from "vitest";
import { ConfigLike, gameTreeArgs } from "./game-args";
import { convertBetString } from "./utils";

const config = (overrides: Partial<ConfigLike> = {}): ConfigLike => ({
  board: [33, 29, 18],
  startingPot: 20,
  effectiveStack: 100,
  rakePercent: 5,
  rakeCap: 3,
  donkOption: false,
  oopFlopBet: "33, 75",
  oopFlopRaise: "3x",
  oopTurnBet: "",
  oopTurnRaise: "",
  oopTurnDonk: "25",
  oopRiverBet: "",
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
  addedLines: "",
  removedLines: "",
  ...overrides,
});

describe("gameTreeArgs", () => {
  test("converts the setup for the engine", () => {
    const args = gameTreeArgs(config());
    expect(args.board).toEqual([33, 29, 18]);
    expect(args.startingPot).toBe(20);
    expect(args.effectiveStack).toBe(100);
    expect(args.rakeRate).toBeCloseTo(0.05);
    expect(args.rakeCap).toBe(3);
    expect(args.oopFlopBet).toBe(convertBetString("33, 75"));
    expect(args.oopFlopRaise).toBe("3x");
    expect(args.ipFlopBet).toBe("50%");
    expect(args.addAllinThreshold).toBeCloseTo(1.5);
    expect(args.forceAllinThreshold).toBeCloseTo(0.2);
    expect(args.mergingThreshold).toBeCloseTo(0.1);
  });

  test("donk sizes only with the donk option", () => {
    expect(gameTreeArgs(config()).oopTurnDonk).toBe("");
    expect(gameTreeArgs(config()).oopRiverDonk).toBe("");
    const withDonk = gameTreeArgs(config({ donkOption: true }));
    expect(withDonk.oopTurnDonk).toBe("25%");
    expect(withDonk.oopRiverDonk).toBe("50%");
  });
});
