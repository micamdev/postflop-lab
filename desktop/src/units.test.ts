import { describe, expect, test } from "vitest";
import { bbText, evBb, exploitabilityText, fromBb, toBb } from "./units";

// The engine and the saved files count in tenths of a big blind; the user sees big blinds.
describe("big blinds", () => {
  test("app amounts read in big blinds", () => {
    expect(toBb(55)).toBe(5.5);
    expect(toBb(975)).toBe(97.5);
    expect(toBb(1000)).toBe(100);
  });

  test("an amount as text: no trailing zeros, no float noise", () => {
    expect(bbText(18)).toBe("1.8");
    expect(bbText(975)).toBe("97.5");
    expect(bbText(1000)).toBe("100");
    expect(bbText(3)).toBe("0.3");
    expect(bbText(0)).toBe("0");
  });

  test("a value typed in big blinds is stored in app units (0.1bb steps)", () => {
    expect(fromBb(5.5)).toBe(55);
    expect(fromBb(97.5)).toBe(975);
    expect(fromBb(0.3)).toBe(3);
    // Finer than 0.1bb: rounded to the nearest step.
    expect(fromBb(2.75)).toBe(28);
    expect(fromBb(1.04)).toBe(10);
  });

  test("an EV in big blinds", () => {
    expect(evBb(27.5)).toBeCloseTo(2.75, 10);
    expect(evBb(-3)).toBeCloseTo(-0.3, 10);
    expect(evBb(Number.NaN)).toBeNaN();
  });
});

describe("exploitability", () => {
  test("in big blinds, then in % of the pot", () => {
    expect(exploitabilityText(0.52, 55)).toBe("0.052bb (0.95%)");
    expect(exploitabilityText(12, 275)).toBe("1.200bb (4.36%)");
  });

  test("without a pot: the amount only", () => {
    expect(exploitabilityText(0.52, 0)).toBe("0.052bb");
  });
});
