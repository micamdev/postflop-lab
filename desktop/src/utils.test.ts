import { describe, expect, test } from "vitest";
import {
  convertBetString,
  nutAdvantageText,
  sanitizeBetString,
  suitTextClasses,
} from "./utils";

describe("suitTextClasses", () => {
  test("four readable suit colours for dark backgrounds", () => {
    expect(suitTextClasses).toHaveLength(4);
    expect(suitTextClasses.some((c) => c.includes("black"))).toBe(false);
    expect(new Set(suitTextClasses).size).toBe(4);
  });
});

describe("bet sizes typed with a percent sign", () => {
  test("sanitizeBetString accepts a trailing %", () => {
    expect(sanitizeBetString("50%, 100", false)).toEqual({
      s: "50, 100",
      valid: true,
    });
    expect(sanitizeBetString("50%%", false).valid).toBe(false);
  });

  test("convertBetString does not double the %", () => {
    expect(convertBetString("50%, 100")).toBe("50%,100%");
    expect(convertBetString("2e150%, 2.5x")).toBe("2e150%,2.5x");
  });
});

describe("nutAdvantageText", () => {
  // Shares per tranche: >= 90%, 75-90%, 50-75%, < 50%.
  test("compares the 90%+ hands", () => {
    expect(nutAdvantageText([0.1, 0.1, 0.4, 0.4], [0.02, 0.2, 0.3, 0.48])).toBe(
      "OOP (10.0% vs 2.0% at 90%+)"
    );
  });

  test("falls back to 75%+ when the 90%+ shares are too close", () => {
    expect(
      nutAdvantageText([0, 0.189, 0.811, 0], [0, 0.153, 0.025, 0.822])
    ).toBe("OOP (18.9% vs 15.3% at 75%+)");
    expect(nutAdvantageText([0.005, 0.1, 0.4, 0.495], [0, 0.3, 0.2, 0.5])).toBe(
      "IP (30.0% vs 10.5% at 75%+)"
    );
  });

  test("no advantage", () => {
    expect(nutAdvantageText([0, 0.1, 0.4, 0.5], [0, 0.105, 0.4, 0.495])).toBe(
      "—"
    );
    expect(nutAdvantageText([NaN, NaN, NaN, NaN], [0, 0, 0, 1])).toBe("—");
  });
});
