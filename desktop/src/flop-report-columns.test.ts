import { describe, expect, test } from "vitest";
import { reportColumns, valueCells } from "./flop-report-columns";

const actions = ["Check:0", "Bet:18"];
const colors = { "Check:0": "green", "Bet:18": "red" };
const players: [string, string] = ["blue", "orange"];

describe("flop report columns", () => {
  test("flop, texture, advantages, strategy, each action, then EV, EQ, EQR per player", () => {
    const columns = reportColumns(actions);
    expect(columns.map((c) => c.key)).toEqual([
      "flop",
      "texture",
      "nut",
      "best",
      "strategy",
      "Check:0",
      "Bet:18",
      "ev0",
      "ev1",
      "eq0",
      "eq1",
      "eqr0",
      "eqr1",
    ]);
    expect(columns.find((c) => c.key === "Bet:18")?.label).toBe("Bet 1.8");
    expect(columns.find((c) => c.key === "eq1")?.label).toBe("EQ IP");
  });

  test("the cells of a row: texts and value bars", () => {
    const cells = valueCells(
      {
        strategy: { "Check:0": 0.25, "Bet:18": 0.75 },
        equity: [0.45, 0.55],
        ev: [20.5, Number.NaN],
        eqr: [0.9, 1.2],
        buckets: null,
      },
      actions,
      colors,
      players
    );
    const byKey = Object.fromEntries(cells.map((c) => [c.key, c]));
    expect(byKey["Bet:18"]).toMatchObject({
      text: "75.0%",
      fill: { ratio: 0.75, color: "red" },
    });
    expect(byKey.ev0.text).toBe("2.05");
    expect(byKey.ev1.text).toBe("—");
    expect(byKey.eq1).toMatchObject({
      text: "55.0%",
      fill: { color: "orange" },
    });
    // 200% fills an EQR cell.
    expect(byKey.eqr1.fill?.ratio).toBeCloseTo(0.6);
  });

  test("an older save without strategy: dashes, no bars", () => {
    const cells = valueCells(
      {
        strategy: null,
        equity: [0.5, 0.5],
        ev: [1, 2],
        eqr: [1, 1],
        buckets: null,
      },
      actions,
      colors,
      players
    );
    expect(cells[0]).toMatchObject({ text: "—", fill: undefined });
  });
});
