import { describe, expect, test } from "vitest";
import { convertBetString, sanitizeBetString, suitTextClasses } from "./utils";

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
