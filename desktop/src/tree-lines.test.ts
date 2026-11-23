import { describe, expect, test } from "vitest";
import { actionCode, readableLines } from "./tree-lines";

describe("tree lines", () => {
  test("each action's code in a line", () => {
    expect(actionCode("Fold", "0")).toBe("F");
    expect(actionCode("Check", "0")).toBe("X");
    expect(actionCode("Call", "0")).toBe("C");
    expect(actionCode("Bet", "30")).toBe("B30");
    expect(actionCode("Raise", "90")).toBe("R90");
    expect(actionCode("Allin", "300")).toBe("A300");
  });

  test("the lines of a list, readable; none for an empty list", () => {
    expect(readableLines("")).toEqual([]);
    expect(readableLines("X-B30,X-X")).toHaveLength(2);
  });

  test("amounts read in big blinds; the codes stay in app units", () => {
    expect(readableLines("X-B30-R95|X")).toEqual([
      "Check - Bet 3 - Raise 9.5, Check",
    ]);
  });
});
