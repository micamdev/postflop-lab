// Breakdown of a player's range by hand category, draw and equity, and the category filter.

import {
  DRAW_CATEGORIES,
  EQUITY_BUCKETS,
  EQUITY_RANGES,
  HAND_CATEGORIES,
  drawCategory,
  equityBucket,
  equityRange,
  handCategory,
} from "./hand-category";
import type { Results } from "./result-types";

export type BreakdownGroup = "hands" | "draws" | "buckets" | "ranges";

export type BreakdownRow = {
  group: BreakdownGroup;
  name: string;
  /** Weighted combos (range weight, as in the Summary's Weight column). */
  combos: number;
  /** Share of the player's combos. */
  rangeShare: number;
  equity: number;
  ev: number;
  /** Frequency of each action, or null when the player is not the one acting. */
  strategy: number[] | null;
};

/** Selected rows per group: union inside a group, intersection across groups. */
export type BreakdownFilter = Partial<Record<BreakdownGroup, string[]>>;

const GROUP_NAMES: Record<BreakdownGroup, readonly string[]> = {
  hands: HAND_CATEGORIES,
  draws: DRAW_CATEGORIES,
  buckets: EQUITY_BUCKETS,
  ranges: EQUITY_RANGES,
};

/** Rows under this many combos are hidden (they would show as 0.0). */
const MIN_COMBOS = 0.05;

type Categories = { hands: string; draws: string }[];

// The categories only depend on the cards: computed once per hand list and board.
const cache = new WeakMap<number[], { board: string; value: Categories }>();

const categories = (cards: number[], board: number[]): Categories => {
  const key = board.join(",");
  const hit = cache.get(cards);
  if (hit && hit.board === key) return hit.value;
  const value = cards.map((packed) => {
    const hole: [number, number] = [packed & 0xff, packed >>> 8];
    return {
      hands: handCategory(hole, board),
      draws: drawCategory(hole, board),
    };
  });
  cache.set(cards, { board: key, value });
  return value;
};

/** Category of combo `h` in `group`. */
const categoryOf = (
  cats: Categories,
  equity: number[],
  group: BreakdownGroup,
  h: number
): string => {
  switch (group) {
    case "hands":
      return cats[h].hands;
    case "draws":
      return cats[h].draws;
    case "buckets":
      return equityBucket(equity[h]);
    case "ranges":
      return equityRange(equity[h]);
  }
};

/** Rows of every group in display order; the draws group is empty on the river. */
export const breakdownRows = (
  results: Results,
  cards: number[],
  board: number[],
  player: 0 | 1,
  acting: boolean
): BreakdownRow[] => {
  const cats = categories(cards, board);
  const weights = results.weights[player];
  const normalizer = results.normalizer[player];
  const equity = results.equity[player];
  const ev = results.ev[player];
  const n = cards.length;
  const numActions = results.numActions;
  const totalWeight = weights.reduce(
    (sum, w, h) => sum + (normalizer[h] > 0 ? w : 0),
    0
  );
  // No draws on the river; no equity groups when the engine sent no equities (it sends
  // none when either player has no hands left).
  const hasEquity = equity.length === n;
  const groups = (
    ["hands", "draws", "buckets", "ranges"] as BreakdownGroup[]
  ).filter(
    (group) =>
      (group !== "draws" || board.length < 5) &&
      (hasEquity || (group !== "buckets" && group !== "ranges"))
  );

  const rows: BreakdownRow[] = [];
  for (const group of groups) {
    for (const name of GROUP_NAMES[group]) {
      let combos = 0;
      let norm = 0;
      let eqSum = 0;
      let evSum = 0;
      const strategy = new Array<number>(numActions).fill(0);
      for (let h = 0; h < n; h++) {
        // Hands the opponent fully blocks (normalizer 0) are not shown, as in the Summary.
        if (
          normalizer[h] === 0 ||
          categoryOf(cats, equity, group, h) !== name
        ) {
          continue;
        }
        combos += weights[h];
        norm += normalizer[h];
        eqSum += normalizer[h] * equity[h];
        evSum += normalizer[h] * ev[h];
        if (acting) {
          for (let a = 0; a < numActions; a++) {
            strategy[a] += normalizer[h] * results.strategy[a * n + h];
          }
        }
      }
      if (combos < MIN_COMBOS) continue;
      rows.push({
        group,
        name,
        combos,
        rangeShare: totalWeight > 0 ? combos / totalWeight : 0,
        equity: norm > 0 ? eqSum / norm : Number.NaN,
        ev: norm > 0 ? evSum / norm : Number.NaN,
        strategy:
          acting && norm > 0
            ? strategy.map((s) => s / norm)
            : acting
              ? strategy
              : null,
      });
    }
  }
  return rows;
};

/** Combos kept by `filter` (every combo when the filter is empty). */
export const comboMask = (
  cards: number[],
  board: number[],
  equity: number[],
  filter: BreakdownFilter
): boolean[] => {
  const cats = categories(cards, board);
  const active = (Object.keys(filter) as BreakdownGroup[]).filter(
    (group) =>
      (filter[group]?.length ?? 0) > 0 &&
      (equity.length === cards.length ||
        (group !== "buckets" && group !== "ranges"))
  );
  return cards.map((_, h) =>
    active.every((group) =>
      filter[group]!.includes(categoryOf(cats, equity, group, h))
    )
  );
};

/** The filter without its equity selections (they belong to the Simple or Advanced view). */
export const withoutEquityFilter = (
  filter: BreakdownFilter
): BreakdownFilter => {
  const rest = { ...filter };
  delete rest.buckets;
  delete rest.ranges;
  return rest;
};

/** Whether the filter selects anything. */
export const isFilterActive = (filter: BreakdownFilter): boolean =>
  Object.values(filter).some((names) => (names?.length ?? 0) > 0);

/**
 * Copy of `results` where the combos of `player` outside `mask` have no weight; the
 * player is marked empty when nothing is left.
 */
export const filterResults = (
  results: Results,
  player: 0 | 1,
  mask: boolean[]
): Results => {
  const keep = (values: number[]) => values.map((v, h) => (mask[h] ? v : 0));
  const weights = [...results.weights];
  const normalizer = [...results.normalizer];
  weights[player] = keep(results.weights[player]);
  normalizer[player] = keep(results.normalizer[player]);
  const isEmpty = mask.some((kept, h) => kept && weights[player][h] > 0)
    ? results.isEmpty
    : results.isEmpty | (1 << player);
  return { ...results, weights, normalizer, isEmpty };
};
