import { describe, expect, test } from "vitest";
import { suitTextClasses } from "./utils";

describe("suitTextClasses", () => {
  test("four readable suit colours for dark backgrounds", () => {
    expect(suitTextClasses).toHaveLength(4);
    expect(suitTextClasses.some((c) => c.includes("black"))).toBe(false);
    expect(new Set(suitTextClasses).size).toBe(4);
  });
});
