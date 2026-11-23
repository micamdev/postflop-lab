import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { emptySetup, useConfigStore } from "./store";
import { setupErrors } from "./setup-validation";
import { configToValue } from "./tree-config-value";
import { SRP_SIMPLIFIED } from "./default-trees";

describe("a new Setup", () => {
  beforeEach(() => setActivePinia(createPinia()));

  test("a real spot: single raised pot at 100bb (x10 units), the simplified SRP default tree", () => {
    const config = useConfigStore();
    expect(config.startingPot).toBe(55);
    expect(config.effectiveStack).toBe(975);
    // The Setup starts as the "Default › SRP, opener IP (simplified)" tree, NL50 rake.
    expect(configToValue(config)).toEqual(SRP_SIMPLIFIED);
    expect([config.rakePercent, config.rakeCap]).toEqual([5, 60]);
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
