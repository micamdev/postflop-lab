import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { emptySetup, useConfigStore } from "./store";
import { setupErrors } from "./setup-validation";

describe("a new Setup", () => {
  beforeEach(() => setActivePinia(createPinia()));

  test("a real spot: single raised pot at 100bb (x10 units), usual bet sizes", () => {
    const config = useConfigStore();
    expect(config.startingPot).toBe(55);
    expect(config.effectiveStack).toBe(975);
    expect([config.oopFlopBet, config.ipFlopBet]).toEqual(["33, 75", "33, 75"]);
    expect([config.oopTurnBet, config.ipTurnBet]).toEqual(["75", "75"]);
    expect([config.oopRiverBet, config.ipRiverBet]).toEqual(["75", "75"]);
    for (const raise of [
      config.oopFlopRaise,
      config.ipFlopRaise,
      config.oopTurnRaise,
      config.ipTurnRaise,
      config.oopRiverRaise,
      config.ipRiverRaise,
    ]) {
      expect(raise).toBe("60");
    }
  });

  test("the defaults are valid: only the board is missing", () => {
    const config = useConfigStore();
    const errors = Object.values(setupErrors(config)).flat();
    expect(errors.every((e) => /board/i.test(e))).toBe(true);
  });

  test("Clear still empties everything", () => {
    expect(emptySetup().oopFlopBet).toBe("");
    expect(emptySetup().startingPot).toBe(0);
  });
});
