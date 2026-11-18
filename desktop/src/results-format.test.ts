import { describe, expect, test } from "vitest";
import { eqrOf, evDigitsFor, toFixed1, toFixed2, toFixed3 } from "./utils";
import { withNaN } from "./invokes-numbers";

describe("eqrOf", () => {
  test("EV / (pot × equity)", () => {
    expect(eqrOf(5, 0.5, 10)).toBe(1);
  });

  test("no equity: undefined, not infinite", () => {
    expect(eqrOf(0, 0, 10)).toBeNaN();
    expect(eqrOf(3, 0, 10)).toBeNaN();
  });
});

describe("evDigitsFor", () => {
  test("by magnitude, negative EVs included", () => {
    expect(evDigitsFor([1, 9.99])).toBe(3);
    expect(evDigitsFor([1, 50])).toBe(2);
    expect(evDigitsFor([-50, 1])).toBe(2);
    expect(evDigitsFor([-500])).toBe(1);
    // An undefined EV does not force 3 decimals.
    expect(evDigitsFor([512.3, Number.NaN])).toBe(1);
  });
});

describe("number formatting", () => {
  test("undefined values show a dash, infinite ones the infinity sign", () => {
    expect(toFixed1(Number.NaN)).toBe("-");
    expect(toFixed2(Number.NaN)).toBe("-");
    expect(toFixed3(Number.NaN)).toBe("-");
    expect(toFixed2(Infinity)).toBe("∞");
    expect(toFixed3(-Infinity)).toBe("-∞");
  });

  test("no negative zero", () => {
    expect(toFixed2(-0.001)).toBe("0.00");
  });
});

describe("withNaN", () => {
  test("null sent by Rust for NaN or infinite values becomes NaN", () => {
    const out = withNaN([[0.5, null], [null]] as unknown as number[][]);
    expect(out[0][0]).toBe(0.5);
    expect(out[0][1]).toBeNaN();
    expect(out[1][0]).toBeNaN();
  });
});
