import { describe, expect, test } from "vitest";
import {
  breakdownRows,
  comboMask,
  filterResults,
  withoutEquityFilter,
} from "./breakdown";
import type { Results } from "./result-types";

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";
const card = (s: string) => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]);
/** "AsKs" → packed private hand (card1 | card2 << 8). */
const pair = (s: string) => card(s.slice(0, 2)) | (card(s.slice(2)) << 8);

const BOARD = ["Kh", "9d", "4c"].map(card);
// OOP: AsKs Top pair, QsJs No made hand + Gutshot, 9s9h Set.
const CARDS = ["AsKs", "QsJs", "9s9h"].map(pair);

const results = (): Results => ({
  currentPlayer: "oop",
  numActions: 2,
  isEmpty: 0,
  eqrBase: [1, 1],
  weights: [[1, 0.5, 1], [1]],
  normalizer: [[1, 0.5, 1], [1]],
  equity: [[0.8, 0.3, 0.95], [0.5]],
  ev: [[10, 2, 20], [5]],
  eqr: [[1, 1, 1], [1]],
  // Check, then bet, per hand: AsKs and 9s9h check, QsJs bets.
  strategy: [1, 0, 1, 0, 1, 0],
  actionEv: [],
});

const row = (rows: ReturnType<typeof breakdownRows>, name: string) =>
  rows.find((r) => r.name === name);

describe("breakdownRows", () => {
  test("combos, share of the range, equity and EV per category", () => {
    const rows = breakdownRows(results(), CARDS, BOARD, 0, true);
    expect(row(rows, "Top pair")).toMatchObject({
      group: "hands",
      combos: 1,
      rangeShare: 0.4,
      equity: 0.8,
      ev: 10,
    });
    expect(row(rows, "Gutshot")).toMatchObject({ group: "draws", combos: 0.5 });
    expect(row(rows, "Top pair")!.strategy).toEqual([1, 0]);
    expect(row(rows, "No made hand")!.strategy).toEqual([0, 1]);
    // Every combo is in exactly one row per group.
    const total = (group: string) =>
      rows.filter((r) => r.group === group).reduce((s, r) => s + r.combos, 0);
    expect(total("hands")).toBeCloseTo(2.5);
    expect(total("draws")).toBeCloseTo(2.5);
    expect(total("buckets")).toBeCloseTo(2.5);
    expect(total("ranges")).toBeCloseTo(2.5);
  });

  test("no strategy when the player is not the one acting", () => {
    const rows = breakdownRows(results(), CARDS, BOARD, 0, false);
    expect(row(rows, "Top pair")!.strategy).toBeNull();
  });

  test("empty categories are left out", () => {
    const rows = breakdownRows(results(), CARDS, BOARD, 0, true);
    expect(row(rows, "Overpair")).toBeUndefined();
  });

  test("no draws on the river", () => {
    const river = [...BOARD, card("2d"), card("7h")];
    const rows = breakdownRows(results(), CARDS, river, 0, true);
    expect(rows.some((r) => r.group === "draws")).toBe(false);
  });
});

describe("comboMask", () => {
  test("union inside a group", () => {
    const mask = comboMask(CARDS, BOARD, results().equity[0], {
      hands: ["Top pair", "Set"],
    });
    expect(mask).toEqual([true, false, true]);
  });

  test("intersection across groups", () => {
    const mask = comboMask(CARDS, BOARD, results().equity[0], {
      hands: ["Top pair"],
      draws: ["Gutshot"],
    });
    expect(mask).toEqual([false, false, false]);
  });

  test("no filter keeps everything", () => {
    expect(comboMask(CARDS, BOARD, results().equity[0], {})).toEqual([
      true,
      true,
      true,
    ]);
  });
});

describe("filterResults", () => {
  test("excluded combos lose their weight; the input is unchanged", () => {
    const input = results();
    const filtered = filterResults(input, 0, [true, false, true]);
    expect(filtered.weights[0]).toEqual([1, 0, 1]);
    expect(filtered.normalizer[0]).toEqual([1, 0, 1]);
    expect(filtered.weights[1]).toEqual([1]);
    expect(filtered.isEmpty).toBe(0);
    expect(input.weights[0]).toEqual([1, 0.5, 1]);
  });

  test("nothing left: the player is marked empty", () => {
    const filtered = filterResults(results(), 0, [false, false, false]);
    expect(filtered.isEmpty & 1).toBe(1);
  });
});

describe("players without hands", () => {
  // The engine sends no equity at all when either player has no hands left.
  const noEquity = (): Results => ({
    ...results(),
    isEmpty: 2,
    equity: [[], []],
    ev: [[], []],
  });

  test("no equity groups without equities", () => {
    const rows = breakdownRows(noEquity(), CARDS, BOARD, 0, true);
    expect(
      rows.some((r) => r.group === "buckets" || r.group === "ranges")
    ).toBe(false);
    expect(row(rows, "Top pair")).toBeDefined();
  });

  test("equity filters are ignored without equities", () => {
    const mask = comboMask(CARDS, BOARD, [], { buckets: ["Best hands"] });
    expect(mask).toEqual([true, true, true]);
  });
});

describe("withoutEquityFilter", () => {
  test("drops the bucket and range selections, keeps the others", () => {
    expect(
      withoutEquityFilter({
        hands: ["Set"],
        buckets: ["Best hands"],
        ranges: ["Equity 0-25"],
      })
    ).toEqual({ hands: ["Set"] });
  });
});

describe("hands the opponent's range fully blocks", () => {
  test("are left out, as in the Summary", () => {
    // QsJs has weight but a normalizer of 0: the Summary does not show it.
    const r = { ...results(), normalizer: [[1, 0, 1], [1]] };
    const rows = breakdownRows(r, CARDS, BOARD, 0, true);
    expect(row(rows, "No made hand")).toBeUndefined();
    const total = rows
      .filter((x) => x.group === "hands")
      .reduce((s, x) => s + x.combos, 0);
    expect(total).toBeCloseTo(2);
  });
});
