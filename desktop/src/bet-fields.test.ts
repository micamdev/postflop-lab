import { describe, expect, test } from "vitest";
import {
  BET_FIELDS,
  betFieldName,
  isDonkField,
  isRaiseField,
} from "./bet-fields";

describe("the bet size fields", () => {
  test("14 fields: OOP bet, raise and donk, IP bet and raise, per street", () => {
    expect(BET_FIELDS).toHaveLength(14);
    expect(BET_FIELDS.filter((f) => f.startsWith("oop"))).toHaveLength(8);
    expect(BET_FIELDS.filter(isDonkField)).toEqual([
      "oopTurnDonk",
      "oopRiverDonk",
    ]);
    expect(BET_FIELDS.filter(isRaiseField)).toHaveLength(6);
  });

  test("readable names", () => {
    expect(betFieldName("oopFlopBet")).toBe("OOP flop bet");
    expect(betFieldName("ipRiverRaise")).toBe("IP river raise");
    expect(betFieldName("oopTurnDonk")).toBe("OOP turn donk");
  });
});
