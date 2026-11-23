// Rows of the results table (one per hand, or per dealt card in chance mode): columns,
// values, sorting, summary and CSV export. No component state.

import type {
  ChanceReports,
  Results,
  SpotPlayer,
  TableMode,
} from "./result-types";
import { bbText, evBb } from "./units";
import { cardPairOrder, capitalize, eqrOf, ranks, suitLetters } from "./utils";

/**
 * Layout of a row: hand (or 0xff00 + dealt card), weight (combos in chance mode), normalizer,
 * equity, EV, EQR, then for each action (last first) its frequency and its EV. Undefined
 * values are NaN.
 */
export const INDEX = {
  CARD_PAIR: 0,
  WEIGHT: 1,
  NORMALIZER: 2,
  EQUITY: 3,
  EV: 4,
  EQR: 5,
  STRATEGY_BASE: 6,
} as const;

export type Column =
  | { label: string; type: "card" | "bar" | "weight" | "ev" }
  | {
      label: string;
      type: "percentage" | "action" | "action-ev";
      index: number;
    };

/** Index in a row of the value a column shows (-1 for the bar). */
export const columnIndex = (column: Column) => {
  switch (column.type) {
    case "card":
      return INDEX.CARD_PAIR;
    case "bar":
      return -1;
    case "weight":
      return INDEX.WEIGHT;
    case "percentage":
      return column.index;
    case "ev":
      return INDEX.EV;
    case "action":
      return INDEX.STRATEGY_BASE + column.index * 2;
    case "action-ev":
      return INDEX.STRATEGY_BASE + column.index * 2 + 1;
  }
};

/** Column label of an action: "Check", "B 30". */
const shortLabel = (action: { name: string; amount: string }) =>
  action.amount === "0"
    ? action.name
    : `${action.name[0]} ${bbText(Number(action.amount))}`;

/**
 * Columns of the table. `actions` are those of the player shown (empty when it does not act
 * here); in hands mode, `actionValue` picks their frequency or their EV.
 */
export const tableColumns = (
  mode: TableMode,
  chanceType: "turn" | "river",
  actions: SpotPlayer["actions"],
  actionValue: "percentage" | "ev"
): Column[] => {
  const isChance = mode === "chance";
  const hasActions = actions.length > 0;
  const weight = isChance ? "Combos" : "Weight";
  const columns: Column[] = [
    { label: isChance ? capitalize(chanceType) : "Hand", type: "card" },
    { label: hasActions ? "Strategy" : `${weight} (Bar)`, type: "bar" },
    { label: weight, type: "weight" },
    { label: "EQ", type: "percentage", index: INDEX.EQUITY },
    { label: "EV", type: "ev" },
    { label: "EQR", type: "percentage", index: INDEX.EQR },
  ];
  const type = !isChance && actionValue === "ev" ? "action-ev" : "action";
  [...actions].reverse().forEach((action, i) => {
    columns.push({ label: shortLabel(action), type, index: i });
  });
  return columns;
};

/** Rows of the hands of `player` that have a weight (only `indices` if given). */
export const handRows = (
  results: Results,
  cards: number[],
  player: number,
  numActions: number,
  indices: number[] | null
): number[][] => {
  const row = (index: number) => {
    const weight = results.weights[player][index];
    const normalizer = results.normalizer[player][index];
    if (weight === 0 || normalizer === 0) return null;
    const values = [
      cards[index],
      weight,
      normalizer,
      // Undefined values are NaN (invokes); no values at all when a range is empty.
      results.equity[player][index] ?? Number.NaN,
      results.ev[player][index] ?? Number.NaN,
      results.eqr[player][index] ?? Number.NaN,
    ];
    for (let i = numActions - 1; i >= 0; --i) {
      const j = i * cards.length + index;
      values.push(results.strategy[j], results.actionEv[j] ?? Number.NaN);
    }
    return values;
  };
  const all = indices ?? cards.map((_, i) => i);
  return all.map(row).filter((r): r is number[] => r !== null);
};

/** Rows of the cards that can be dealt (values NaN where the report has none). */
export const chanceRows = (
  reports: ChanceReports,
  player: number,
  numActions: number
): number[][] => {
  const rows: number[][] = [];
  for (let index = 0; index < 52; ++index) {
    const status = reports.status[index];
    if (status === 0) continue;
    const values = [0xff00 + index, reports.combos[player][index], Number.NaN];
    if (status === 1) {
      values.push(Number.NaN, Number.NaN, Number.NaN);
    } else {
      values.push(
        reports.equity[player][index],
        reports.ev[player][index],
        reports.eqr[player][index]
      );
    }
    for (let i = numActions - 1; i >= 0; --i) {
      values.push(reports.strategy[i * 52 + index], Number.NaN);
    }
    rows.push(values);
  }
  return rows;
};

/**
 * Why some cards show "-" (a range is empty there: no equity or EV), or null. When a player
 * has no combo on any card, the line itself is never played by them (e.g. IP always bets).
 */
export const chanceEmptyNote = (reports: ChanceReports): string | null => {
  const cards = reports.status.flatMap((s, card) => (s === 0 ? [] : [card]));
  if (!cards.some((card) => reports.status[card] === 1)) return null;
  const absent = ["OOP", "IP"].filter((_, player) =>
    cards.every((card) => reports.combos[player][card] === 0)
  );
  if (absent.length === 2) {
    return "Neither player reaches this line: no equity or EV.";
  }
  if (absent.length === 1) {
    return `${absent[0]} never reaches this line: no equity or EV.`;
  }
  return "A range is empty after the cards showing “-”: no equity or EV there.";
};

/** Sorted copy, by hand order or by a value (undefined values after the others, ascending). */
export const sortRows = (
  rows: number[][],
  key: number,
  order: "asc" | "desc"
): number[][] => {
  const byCards = (a: number[], b: number[]) =>
    cardPairOrder(a[0]) - cardPairOrder(b[0]);
  const sorted = [...rows].sort((a, b) => {
    if (key === INDEX.CARD_PAIR) return byCards(a, b);
    const [x, y] = [a[key], b[key]];
    if (!isNaN(x) && !isNaN(y)) return x - y || byCards(a, b);
    if (!isNaN(x)) return -1;
    if (!isNaN(y)) return 1;
    return byCards(a, b);
  });
  if (order === "desc") sorted.reverse();
  return sorted;
};

/** Total weight, other values averaged over the normalizer, EQR from the averages. */
export const summaryOf = (rows: number[][], eqrBase: number) => {
  if (rows.length === 0) return null;
  let normalizer = 0;
  const summary = rows[0].map(() => 0);
  for (const row of rows) {
    const n = row[INDEX.NORMALIZER];
    normalizer += n;
    summary[INDEX.WEIGHT] += row[INDEX.WEIGHT];
    for (let i = INDEX.EQUITY; i < row.length; ++i) summary[i] += row[i] * n;
  }
  for (let i = INDEX.EQUITY; i < summary.length; ++i) summary[i] /= normalizer;
  // EQR is not the average.
  summary[INDEX.EQR] = eqrOf(summary[INDEX.EV], summary[INDEX.EQUITY], eqrBase);
  return summary;
};

const cardStr = (card: number) => ranks[card >>> 2] + suitLetters[card & 3];

/**
 * The table as CSV. `firstLabel` is the label of the first column (chance mode); `isEmpty`
 * drops equity, EV and EQR (a range is empty) in hands mode.
 */
export const summaryCsv = (
  mode: TableMode,
  firstLabel: string,
  rows: number[][],
  actions: SpotPlayer["actions"],
  isEmpty: boolean
): string => {
  const isChance = mode === "chance";
  const header = isChance
    ? [firstLabel, "Combos", "Equity", "EV", "EQR"]
    : ["Hand", "Weight", ...(isEmpty ? [] : ["Equity", "EV", "EQR"])];
  for (const action of [...actions].reverse()) {
    const name =
      action.name +
      (action.amount === "0" ? "" : ` ${bbText(Number(action.amount))}`);
    header.push(`${name} %`);
    if (!isChance) header.push(`${name} EV`);
  }

  const dash = (value: number) => (isNaN(value) ? "-" : value);
  // EVs in big blinds; strategy, equity and weights as they are.
  const ev = (value: number) => dash(evBb(value));
  const lines = rows.map((row) => {
    if (isChance) {
      return [
        cardStr(row[0] & 0xff),
        row[INDEX.WEIGHT],
        dash(row[INDEX.EQUITY]),
        ev(row[INDEX.EV]),
        dash(row[INDEX.EQR]),
        ...row.slice(INDEX.STRATEGY_BASE).filter((_, i) => i % 2 === 0),
      ];
    }
    const hand = cardStr(row[0] >>> 8) + cardStr(row[0] & 0xff);
    const start = isEmpty ? INDEX.STRATEGY_BASE : INDEX.EQUITY;
    // After the strategy base: each action's frequency, then its EV.
    const values = row
      .map((value, i) =>
        i === INDEX.EV ||
        (i >= INDEX.STRATEGY_BASE && (i - INDEX.STRATEGY_BASE) % 2 === 1)
          ? ev(value)
          : value
      )
      .slice(start);
    return [hand, row[INDEX.WEIGHT], ...values];
  });
  return [header, ...lines].map((line) => line.join(",")).join("\n");
};
