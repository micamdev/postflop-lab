import { describe, expect, test } from "vitest";
import { ACTION_COLORS, actionColor, stackedGradient } from "./action-colors";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("actionColor", () => {
  test("fold, check, call and all-in", () => {
    expect(actionColor("Fold", 0, 0)).toBe("#4f86c6");
    expect(actionColor("Check", 0, 0)).toBe("#3fae6e");
    expect(actionColor("Call", 0, 0)).toBe("#3fae6e");
    expect(actionColor("AllIn", 0, 3)).toBe("#7a1f1c");
  });

  test("one or two bets", () => {
    expect(actionColor("Bet", 0, 1)).toBe(ACTION_COLORS.betSmall);
    expect(actionColor("Bet", 0, 2)).toBe("#e0704f");
    expect(actionColor("Bet", 1, 2)).toBe("#9e2f2b");
    expect(actionColor("Raise", 1, 3)).toBe("#c4473a");
  });

  test("bets get darker with size, all-in darkest", () => {
    const colors = [0, 1, 2, 3, 4].map((rank) => actionColor("Bet", rank, 5));
    expect(new Set(colors).size).toBe(5);
    for (let i = 1; i < colors.length; i++) {
      expect(luminance(colors[i])).toBeLessThan(luminance(colors[i - 1]));
    }
    expect(luminance(actionColor("AllIn", 0, 5))).toBeLessThan(
      luminance(colors[4])
    );
  });
});

describe("stackedGradient", () => {
  test("stacks the frequencies in their colours", () => {
    expect(stackedGradient([0.25, 0.75], ["#a", "#b"], "right")).toBe(
      "linear-gradient(to right, #a 0% 25%, #b 25% 100%)"
    );
    expect(stackedGradient([1], ["#c"], "top")).toBe(
      "linear-gradient(to top, #c 0% 100%)"
    );
  });
});
