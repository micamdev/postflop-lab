import { describe, expect, test } from "vitest";
import { nodeStrategy } from "./node-strategy";

const actions = [
  { name: "Check", amount: "0", color: "#3fae6e" },
  { name: "Bet", amount: "30", color: "#e0704f" },
];

describe("nodeStrategy", () => {
  test("frequencies weighted by the hands' weights", () => {
    // Hands 1-3: check 1, 0.5, 0 (weights 1, 1, 2) → check 1.5 / 4.
    const strategy = [1, 0.5, 0, 0, 0.5, 1];
    const items = nodeStrategy(strategy, [1, 1, 2], actions)!;
    expect(items.map((i) => i.name)).toEqual(["Check", "Bet"]);
    expect(items[0].frequency).toBeCloseTo(0.375);
    expect(items[1].frequency).toBeCloseTo(0.625);
    expect(items[1]).toMatchObject({ amount: "30", color: "#e0704f" });
  });

  test("nodeStrategy is null without hands", () => {
    expect(nodeStrategy([], [], actions)).toBeNull();
    expect(nodeStrategy([0, 0, 1, 1], [0, 0], actions)).toBeNull();
  });
});
