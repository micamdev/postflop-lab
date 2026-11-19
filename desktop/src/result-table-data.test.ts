import { describe, expect, test } from "vitest";
import type { ChanceReports, Results } from "./result-types";
import { toSpotActions } from "./nav-spots";
import {
  INDEX,
  chanceRows,
  chanceEmptyNote,
  columnIndex,
  handRows,
  sortRows,
  summaryCsv,
  summaryOf,
  tableColumns,
} from "./result-table-data";

const actions = toSpotActions(["Check:0", "Bet:30"]);

// Two hands of OOP: AhAs (pair 51 << 8 | 50) and 2c2d (1 << 8 | 0); a third with no weight.
const AA = (51 << 8) | 50;
const TWOS = (1 << 8) | 0;
const KK = (47 << 8) | 46;
const results = {
  currentPlayer: "oop",
  numActions: 2,
  isEmpty: 0,
  eqrBase: [100, 100],
  weights: [[1, 0.5, 0], []],
  normalizer: [[2, 1, 0], []],
  equity: [[0.8, 0.2, 0], []],
  ev: [[90, 10, 0], []],
  eqr: [[1.125, 0.5, 0], []],
  // actions x hands: Check then Bet.
  strategy: [0.25, 1, 0, 0.75, 0, 0],
  actionEv: [80, 10, 0, 95, 0, 0],
} as Results;

describe("tableColumns", () => {
  test("hands: fixed columns, then the actions last to first", () => {
    const columns = tableColumns("basics", "turn", actions, "percentage");
    expect(columns.map((c) => c.label)).toEqual([
      "Hand",
      "Strategy",
      "Weight",
      "EQ",
      "EV",
      "EQR",
      "B 30",
      "Check",
    ]);
    expect(columns.slice(6).map(columnIndex)).toEqual([
      INDEX.STRATEGY_BASE,
      INDEX.STRATEGY_BASE + 2,
    ]);
    const ev = tableColumns("basics", "turn", actions, "ev");
    expect(ev.slice(6).map(columnIndex)).toEqual([
      INDEX.STRATEGY_BASE + 1,
      INDEX.STRATEGY_BASE + 3,
    ]);
  });

  test("no actions: a weight bar; chance mode: cards and combos", () => {
    expect(tableColumns("basics", "turn", [], "percentage")[1].label).toBe(
      "Weight (Bar)"
    );
    const chance = tableColumns("chance", "river", [], "percentage");
    expect(chance.map((c) => c.label)).toEqual([
      "River",
      "Combos (Bar)",
      "Combos",
      "EQ",
      "EV",
      "EQR",
    ]);
  });
});

describe("handRows", () => {
  test("hands with weight, values then each action (last first) and its EV", () => {
    const rows = handRows(results, [AA, TWOS, KK], 0, 2, null);
    expect(rows).toEqual([
      [AA, 1, 2, 0.8, 90, 1.125, 0.75, 95, 0.25, 80],
      [TWOS, 0.5, 1, 0.2, 10, 0.5, 0, 0, 1, 10],
    ]);
  });

  test("only the given hands (hovered cell)", () => {
    expect(handRows(results, [AA, TWOS, KK], 0, 2, [1])).toHaveLength(1);
  });
});

describe("chanceRows", () => {
  test("no row for an impossible card; no values for a card without them", () => {
    const reports = {
      currentPlayer: "oop",
      numActions: 0,
      status: [0, 1, 2, ...Array(49).fill(0)],
      combos: [Array(52).fill(3), []],
      equity: [Array(52).fill(0.5), []],
      ev: [Array(52).fill(7), []],
      eqr: [Array(52).fill(1), []],
      strategy: [],
    } as ChanceReports;
    const rows = chanceRows(reports, 0, 0);
    expect(rows).toHaveLength(2);
    expect(rows[0].slice(0, 2)).toEqual([0xff01, 3]);
    expect(rows[0].slice(2).every(isNaN)).toBe(true);
    expect(rows[1]).toEqual([0xff02, 3, Number.NaN, 0.5, 7, 1]);
  });
});

describe("chanceEmptyNote", () => {
  const reports = (status: number[], combos: number[][]) =>
    ({ status, combos }) as unknown as ChanceReports;
  const pad = (xs: number[]) => [...xs, ...Array(52 - xs.length).fill(0)];

  test("none when every card has values", () => {
    expect(
      chanceEmptyNote(reports(pad([2, 2]), [pad([3, 3]), pad([4, 4])]))
    ).toBeNull();
  });

  test("the player who never reaches the line", () => {
    // IP always bets: no IP combo after this line, on every card (#57).
    const r = reports(pad([1, 0, 1]), [pad([16, 0, 16]), pad([0, 0, 0])]);
    expect(chanceEmptyNote(r)).toBe(
      "IP never reaches this line: no equity or EV."
    );
    const oop = reports(pad([1, 1]), [pad([0, 0]), pad([5, 5])]);
    expect(chanceEmptyNote(oop)).toBe(
      "OOP never reaches this line: no equity or EV."
    );
  });

  test("neither player", () => {
    const r = reports(pad([1, 1]), [pad([0, 0]), pad([0, 0])]);
    expect(chanceEmptyNote(r)).toBe(
      "Neither player reaches this line: no equity or EV."
    );
  });

  test("some cards only", () => {
    const r = reports(pad([2, 1]), [pad([3, 3]), pad([4, 0])]);
    expect(chanceEmptyNote(r)).toBe(
      "A range is empty after the cards showing “-”: no equity or EV there."
    );
  });
});

describe("sortRows", () => {
  test("by a value, undefined values after the others when ascending", () => {
    const rows = [
      [AA, 1, 1, 0.8],
      [TWOS, 1, 1, Number.NaN],
      [KK, 1, 1, 0.2],
    ];
    expect(sortRows(rows, INDEX.EQUITY, "asc").map((r) => r[0])).toEqual([
      KK,
      AA,
      TWOS,
    ]);
  });

  test("by hand, in card order", () => {
    const rows = [[AA], [TWOS], [KK]];
    expect(sortRows(rows, INDEX.CARD_PAIR, "desc").map((r) => r[0])).toEqual([
      AA,
      KK,
      TWOS,
    ]);
  });
});

describe("summaryOf", () => {
  test("total weight, values averaged over the normalizer, EQR from the averages", () => {
    const rows = handRows(results, [AA, TWOS, KK], 0, 2, null);
    const summary = summaryOf(rows, 100)!;
    expect(summary[INDEX.WEIGHT]).toBe(1.5);
    expect(summary[INDEX.EQUITY]).toBeCloseTo((0.8 * 2 + 0.2) / 3);
    expect(summary[INDEX.EV]).toBeCloseTo((90 * 2 + 10) / 3);
    expect(summary[INDEX.EQR]).toBeCloseTo(
      summary[INDEX.EV] / (100 * summary[INDEX.EQUITY])
    );
    expect(summaryOf([], 100)).toBeNull();
  });
});

describe("summaryCsv", () => {
  test("hands: header with each action's % and EV, one line per hand", () => {
    const rows = handRows(results, [AA, TWOS, KK], 0, 2, null);
    const csv = summaryCsv("basics", "Hand", rows, actions, false).split("\n");
    expect(csv[0]).toBe(
      "Hand,Weight,Equity,EV,EQR,Bet 30 %,Bet 30 EV,Check %,Check EV"
    );
    expect(csv[1]).toBe("AsAh,1,0.8,90,1.125,0.75,95,0.25,80");
  });
});
