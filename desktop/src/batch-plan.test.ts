import { describe, expect, test } from "vitest";
import type { LibraryEntry, SolutionMeta } from "./invokes";
import { planBatch } from "./batch-plan";
import { configKey } from "./flop-report";

// As = 51, Kd = 45, 7c = 20; Ah = 50, Kc = 44, 7d = 21; 8h = 26, 7h = 22, 6d = 17.
const AK7 = [51, 45, 20];
const AhKc7d = [50, 44, 21];
const EIGHT76 = [26, 22, 17];

const spot = {
  ranges: ["AA,KK", "QQ-99"],
  tree_config: { board: [], startingPot: 20 } as Record<string, unknown>,
  locks: [],
} as unknown as SolutionMeta;
const key = configKey(spot);

const saved = (
  name: string,
  board: number[],
  ranges = spot.ranges,
  batchSize: number | null = 49
): LibraryEntry => ({
  name,
  file_size: 1,
  error: null,
  meta: {
    ...spot,
    ranges,
    board,
    tree_config: { ...spot.tree_config, board },
    batch_size: batchSize,
  } as SolutionMeta,
});

describe("planBatch", () => {
  test("only a flop saved by a batch of the same size is skipped", () => {
    const flops2 = [{ board: AK7, weight: 400 }];
    // Solved by hand, or in another subset: its weight does not fit this subset.
    expect(
      planBatch([saved("hand", AK7, spot.ranges, null)], key, flops2, 49, "p")
        .skipped
    ).toBe(0);
    expect(
      planBatch([saved("b25", AK7, spot.ranges, 25)], key, flops2, 49, "p")
        .skipped
    ).toBe(0);
    expect(
      planBatch([saved("b49", AK7, spot.ranges, 49)], key, flops2, 49, "p")
        .skipped
    ).toBe(1);
  });

  const flops = [
    { board: AK7, weight: 400 },
    { board: EIGHT76, weight: 300 },
  ];

  test("each flop named after the prefix and the board", () => {
    const plan = planBatch([], key, flops, 49, "BTN vs BB");
    expect(plan.toSolve).toEqual([
      { board: AK7, weight: 400, name: "BTN vs BB AsKd7c" },
      { board: EIGHT76, weight: 300, name: "BTN vs BB 8h7h6d" },
    ]);
    expect(plan.skipped).toBe(0);
  });

  test("a flop of this spot already saved (up to the suits) is skipped", () => {
    const plan = planBatch(
      [saved("mine", AhKc7d)],
      key,
      flops,
      49,
      "BTN vs BB"
    );
    expect(plan.toSolve.map((f) => f.name)).toEqual(["BTN vs BB 8h7h6d"]);
    expect(plan.skipped).toBe(1);
  });

  test("the same flop of another spot is solved; a taken name gets a number", () => {
    const other = saved("BTN vs BB AsKd7c", AK7, ["AA", "KK"]);
    const plan = planBatch([other], key, flops, 49, "BTN vs BB");
    expect(plan.toSolve[0].name).toBe("BTN vs BB AsKd7c (2)");
    expect(plan.skipped).toBe(0);
  });

  test("names match regardless of case (Windows file names)", () => {
    const other = saved("btn vs bb askd7c", AK7, ["AA", "KK"]);
    expect(
      planBatch([other], key, flops, 49, "BTN vs BB").toSolve[0].name
    ).toBe("BTN vs BB AsKd7c (2)");
  });
});
