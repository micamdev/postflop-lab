import { describe, expect, test } from "vitest";
import {
  flopTexture,
  flopWeight,
  matchesTexture,
  textureLabel,
} from "./flop-texture";
import { parseCardString } from "./utils";

const board = (text: string) =>
  [0, 2, 4].map((i) => parseCardString(text.slice(i, i + 2)) as number);

describe("flopTexture", () => {
  test("suits", () => {
    expect(flopTexture(board("AsKs7s")).suits).toBe("monotone");
    expect(flopTexture(board("AsKs7d")).suits).toBe("two-tone");
    expect(flopTexture(board("AsKd7c")).suits).toBe("rainbow");
  });

  test("pairing", () => {
    expect(flopTexture(board("AsKd7c")).pairing).toBe("unpaired");
    expect(flopTexture(board("7s7d2c")).pairing).toBe("paired");
    expect(flopTexture(board("7s7d7c")).pairing).toBe("trips");
  });

  test("high card", () => {
    expect(flopTexture(board("Js5d2c")).height).toBe("high");
    expect(flopTexture(board("Ts5d2c")).height).toBe("middle");
    expect(flopTexture(board("8s5d2c")).height).toBe("middle");
    expect(flopTexture(board("7s5d2c")).height).toBe("low");
  });

  test("connected: a straight is possible with two hole cards", () => {
    expect(flopTexture(board("8h7h6d")).connected).toBe(true);
    expect(flopTexture(board("Js9d7c")).connected).toBe(true);
    // The ace plays low too.
    expect(flopTexture(board("As4d2c")).connected).toBe(true);
    expect(flopTexture(board("AsKd7c")).connected).toBe(false);
    expect(flopTexture(board("Ks8d3c")).connected).toBe(false);
    // Two distinct ranks only (paired): no straight.
    expect(flopTexture(board("8s8d7c")).connected).toBe(false);
  });
});

describe("textureLabel", () => {
  test("high card, then the features", () => {
    expect(textureLabel(board("AsKd7c"))).toBe("A high, rainbow");
    expect(textureLabel(board("8h7h6d"))).toBe("8 high, two-tone, connected");
    expect(textureLabel(board("7s7d2c"))).toBe("7 high, paired, rainbow");
    expect(textureLabel(board("QhJhTh"))).toBe("Q high, monotone, connected");
  });
});

describe("flopWeight", () => {
  test("the number of flops equal up to the suits", () => {
    expect(flopWeight(board("AsKd7c"))).toBe(24);
    expect(flopWeight(board("AsKs7s"))).toBe(4);
    // Which two cards share a suit matters.
    expect(flopWeight(board("AsKs7d"))).toBe(12);
    expect(flopWeight(board("AsAd7c"))).toBe(12);
    expect(flopWeight(board("AsAd7s"))).toBe(12);
    expect(flopWeight(board("AsAdAc"))).toBe(4);
  });
});

describe("matchesTexture", () => {
  test("one feature at a time", () => {
    expect(matchesTexture(board("AsKd7c"), "all")).toBe(true);
    expect(matchesTexture(board("AsKd7c"), "rainbow")).toBe(true);
    expect(matchesTexture(board("AsKd7c"), "monotone")).toBe(false);
    expect(matchesTexture(board("7s7d2c"), "paired")).toBe(true);
    // Trips count as paired.
    expect(matchesTexture(board("7s7d7c"), "paired")).toBe(true);
    expect(matchesTexture(board("8h7h6d"), "connected")).toBe(true);
    expect(matchesTexture(board("8h7h6d"), "middle")).toBe(true);
    expect(matchesTexture(board("8h7h6d"), "two-tone")).toBe(true);
  });
});
