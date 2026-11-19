import { describe, expect, test } from "vitest";
import { allFlops, representativeFlops, SUBSET_SIZES } from "./flop-subsets";
import { flopTexture, flopWeight } from "./flop-texture";

const classOf = (board: number[]) => {
  const t = flopTexture(board);
  return `${t.suits}/${t.pairing}`;
};

describe("allFlops", () => {
  const flops = allFlops();

  test("1755 flops distinct up to the suits, weights summing to the 22100 flops", () => {
    expect(flops).toHaveLength(1755);
    expect(flops.reduce((sum, f) => sum + f.weight, 0)).toBe(22100);
    expect(new Set(flops.map((f) => f.board.join(","))).size).toBe(1755);
  });

  test("each weight is the number of suit variants", () => {
    for (const f of flops.slice(0, 200)) {
      expect(f.weight).toBe(flopWeight(f.board));
    }
  });
});

describe("representativeFlops", () => {
  test.each(SUBSET_SIZES)("%i flops, weights summing to 22100", (n) => {
    const subset = representativeFlops(n);
    expect(subset).toHaveLength(n);
    expect(subset.reduce((sum, f) => sum + f.weight, 0)).toBe(22100);
    expect(new Set(subset.map((f) => f.board.join(","))).size).toBe(n);
  });

  test("every texture class is there, in proportion to how often it occurs", () => {
    const all = allFlops();
    const share = (flops: { board: number[]; weight: number }[], cls: string) =>
      flops
        .filter((f) => classOf(f.board) === cls)
        .reduce((sum, f) => sum + f.weight, 0) / 22100;
    const subset = representativeFlops(49);
    for (const cls of new Set(all.map((f) => classOf(f.board)))) {
      expect(subset.some((f) => classOf(f.board) === cls)).toBe(true);
      // A class keeps its total weight: the average is not skewed.
      expect(share(subset, cls)).toBeCloseTo(share(all, cls), 10);
    }
  });

  test("the ranks are spread: aces, middle and low flops", () => {
    const highs = representativeFlops(25).map((f) =>
      Math.max(...f.board.map((c) => c >>> 2))
    );
    expect(highs).toContain(12);
    expect(highs.some((h) => h <= 5)).toBe(true);
  });

  test("all flops: the full list", () => {
    expect(representativeFlops(1755)).toEqual(allFlops());
  });

  test("the same subset every time", () => {
    expect(representativeFlops(49)).toEqual(representativeFlops(49));
  });
});

describe("small subsets", () => {
  test("fewer flops than texture classes still covers every class", () => {
    expect(representativeFlops(3).length).toBeGreaterThanOrEqual(3);
    const total = representativeFlops(3).reduce((s, f) => s + f.weight, 0);
    expect(total).toBe(22100);
  });
});
