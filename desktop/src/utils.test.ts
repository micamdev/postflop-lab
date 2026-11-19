import { describe, expect, test } from "vitest";
import {
  convertBetString,
  bucketLeader,
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

describe("bucketLeader", () => {
  // Shares per tranche: >= 90%, 75-90%, 50-75%, < 50%.
  test("the player with more of the tranche, by at least 1 point", () => {
    const oop = [0.1, 0.1, 0.4, 0.4];
    const ip = [0.02, 0.2, 0.3, 0.48];
    expect(bucketLeader(oop, ip, 0)).toBe(0);
    expect(bucketLeader(oop, ip, 1)).toBe(1);
  });

  test("nobody within 1 point, or without data", () => {
    expect(bucketLeader([0.005, 0.1], [0, 0.3], 0)).toBeNull();
    expect(bucketLeader([0, 0.1], [0, 0.3], 0)).toBeNull();
    expect(bucketLeader([NaN, 0], [0.5, 0], 0)).toBeNull();
  });
});
