// The flop report: the solutions of one spot on different flops, compared row by row. Built
// from the library metadata only (no solution is loaded).

import type { LibraryEntry, SolutionMeta } from "./invokes";
import { canonicalFlopKey, flopWeight, textureLabel } from "./flop-texture";
import { cardText } from "./utils";

/** Whose first decision is the c-bet: IP after OOP checks, or OOP first. */
export type CbetBy = "ip" | "oop";

/** Turns an object into JSON with its keys sorted, at every level. */
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * What a spot is, the board aside: ranges, tree configuration and locks. Two solutions are in
 * the same report only if their keys are equal (precision and save depth do not matter).
 */
export const configKey = (meta: SolutionMeta): string => {
  const tree = { ...meta.tree_config };
  delete tree.board;
  return stableJson({ ranges: meta.ranges, tree, locks: meta.locks ?? [] });
};

/** IP after check when OOP acts first and can check (the usual case), else OOP. */
export const defaultCbetBy = (meta: SolutionMeta): CbetBy =>
  meta.summary.root_player === "oop" &&
  meta.summary.root_actions[0] === "Check:0"
    ? "ip"
    : "oop";

export type ReportRow = {
  name: string;
  board: number[];
  texture: string;
  /** How often the flop occurs: its batch subset weight, else its number of suit variants. */
  weight: number;
  /** Equity and EV of the c-bettor at the root. */
  equity: number;
  ev: number;
  /** Frequency of each action ("Bet:7") at the c-bet node; null if not saved (older save). */
  strategy: Record<string, number> | null;
  /** OOP and IP equity tranches (>= 90%, 75-90%, 50-75%, < 50%); null if not saved. */
  buckets: [number[], number[]] | null;
  /** Saved before schema 3: "Update older saves" can add the strategy and tranches. */
  isOlderSave: boolean;
  /** Size of the subset of the batch that solved it; null if solved by hand. */
  batchSize: number | null;
  /** Counted in the average (see `buildReport`). */
  inAverage: boolean;
  createdAt: number;
};

const toStrategy = (actions: string[], frequencies: number[]) =>
  Object.fromEntries(actions.map((a, i) => [a, frequencies[i]]));

/** The flops of the spot `key` (solutions with a flop board only), in library order. */
export const reportRows = (
  entries: LibraryEntry[],
  key: string,
  cbetBy: CbetBy
): ReportRow[] =>
  entries.flatMap((entry) => {
    const meta = entry.meta;
    if (!meta || meta.board.length !== 3 || configKey(meta) !== key) return [];
    const { summary } = meta;
    const player = cbetBy === "ip" ? 1 : 0;
    let strategy: Record<string, number> | null = null;
    if (cbetBy === "ip" && summary.ip_after_check) {
      const node = summary.ip_after_check;
      strategy = toStrategy(node.actions, node.frequencies);
    } else if (cbetBy === "oop" && summary.root_player === "oop") {
      strategy = toStrategy(summary.root_actions, summary.root_frequencies);
    }
    return [
      {
        name: entry.name,
        board: meta.board,
        texture: textureLabel(meta.board),
        weight: meta.flop_weight ?? flopWeight(meta.board),
        equity: summary.equity[player],
        ev: summary.ev[player],
        strategy,
        buckets: summary.equity_buckets ?? null,
        isOlderSave: meta.schema < 3,
        batchSize: meta.batch_size ?? null,
        inAverage: true,
        createdAt: meta.created_at,
      },
    ];
  });

/**
 * The report rows: one per flop up to the suits (a flop solved twice, or AsKd7c and AhKc7d,
 * would count twice in the average). When batches solved this spot, the average uses one
 * subset, the largest: its weights stand for all flops, together and only together (a
 * hand-solved flop's weight only stands for its own suits, another subset's for other flops).
 * A flop is kept from that subset first, then from any batch, then the most recent.
 * `subset` says which subset the average uses and how many of its flops are solved.
 */
export const buildReport = (
  entries: LibraryEntry[],
  key: string,
  cbetBy: CbetBy
): {
  rows: ReportRow[];
  duplicates: number;
  subset: { size: number; solved: number } | null;
} => {
  const all = reportRows(entries, key, cbetBy);
  const sizes = all.flatMap((r) => (r.batchSize === null ? [] : [r.batchSize]));
  const size = sizes.length > 0 ? Math.max(...sizes) : null;
  const rank = (row: ReportRow) =>
    row.batchSize === size && size !== null
      ? 2
      : row.batchSize !== null
        ? 1
        : 0;
  const best = new Map<string, ReportRow>();
  for (const row of all) {
    const flop = canonicalFlopKey(row.board);
    const kept = best.get(flop);
    if (
      !kept ||
      rank(row) > rank(kept) ||
      (rank(row) === rank(kept) && row.createdAt > kept.createdAt)
    ) {
      best.set(flop, row);
    }
  }
  const rows = all
    .filter((row) => best.get(canonicalFlopKey(row.board)) === row)
    .map((row) => ({
      ...row,
      inAverage: size === null || row.batchSize === size,
    }));
  return {
    rows,
    duplicates: all.length - rows.length,
    subset:
      size === null
        ? null
        : { size, solved: rows.filter((r) => r.inAverage).length },
  };
};

const amountOf = (action: string) => Number(action.split(":")[1]) || 0;

/** Actions of all rows: fold, check and call first, then bets and raises by amount. */
export const reportActions = (rows: ReportRow[]): string[] => {
  const all = new Set(rows.flatMap((r) => Object.keys(r.strategy ?? {})));
  return [...all].sort((a, b) => amountOf(a) - amountOf(b));
};

/**
 * Average of the rows weighted by how often each flop occurs. A missing action counts 0;
 * rows without a strategy (or tranches) are left out of that average.
 */
export const averageRow = (allRows: ReportRow[]) => {
  const rows = allRows.filter((r) => r.inAverage);
  const mean = (pick: (r: ReportRow) => number | null) => {
    let sum = 0;
    let total = 0;
    for (const r of rows) {
      const value = pick(r);
      if (value === null || !isFinite(value)) continue;
      sum += value * r.weight;
      total += r.weight;
    }
    return total > 0 ? sum / total : Number.NaN;
  };
  const withStrategy = rows.filter((r) => r.strategy);
  const strategy =
    withStrategy.length === 0
      ? null
      : Object.fromEntries(
          reportActions(rows).map((a) => [
            a,
            mean((r) => (r.strategy ? (r.strategy[a] ?? 0) : null)),
          ])
        );
  const withBuckets = rows.filter((r) => r.buckets);
  const buckets =
    withBuckets.length === 0
      ? null
      : ([0, 1].map((p) =>
          [0, 1, 2, 3].map((i) => mean((r) => r.buckets?.[p][i] ?? null))
        ) as [number[], number[]]);
  return {
    weight: rows.reduce((sum, r) => sum + r.weight, 0),
    equity: mean((r) => r.equity),
    ev: mean((r) => r.ev),
    strategy,
    buckets,
  };
};

/**
 * Who holds more of the strongest hands (the `top` best equity tranches: 1 = 90%+, nut
 * advantage; 2 = 75%+, best hands advantage) and by how many points: "IP +9.0", "None" under
 * one point (as in the Compare tab), "—" without data.
 */
export const advantageText = (
  buckets: [number[], number[]] | null,
  top: 1 | 2
): string => {
  if (!buckets) return "—";
  const [oop, ip] = buckets.map((b) =>
    b.slice(0, top).reduce((sum, x) => sum + x, 0)
  );
  if (isNaN(oop) || isNaN(ip)) return "—";
  const gap = Math.abs(oop - ip) * 100;
  if (gap < 1) return "None";
  return `${oop > ip ? "OOP" : "IP"} +${gap.toFixed(1)}`;
};

/** "Bet 7", "Check": the name of an action for a column. */
export const actionLabel = (action: string) => {
  const [name, amount] = action.split(":");
  return amount === "0" || amount === undefined ? name : `${name} ${amount}`;
};

/** Board text, highest card first: "AsKd7c". */
export const boardText = (board: number[]) =>
  [...board]
    .sort((a, b) => b - a)
    .map((card) => cardText(card).rank + cardText(card).suitLetter)
    .join("");

const csvCell = (text: string) => (text.includes(",") ? `"${text}"` : text);

/** The report as CSV (for notes): one line per flop. */
export const reportCsv = (rows: ReportRow[], actions: string[]): string => {
  const header = [
    "Flop",
    "Texture",
    "Weight",
    ...actions.map((a) => `${actionLabel(a)} %`),
    "Equity %",
    "EV",
    "Nut advantage",
    "Best hands advantage",
  ];
  const lines = rows.map((r) => [
    boardText(r.board),
    csvCell(r.texture),
    String(r.weight),
    ...actions.map((a) =>
      r.strategy ? ((r.strategy[a] ?? 0) * 100).toFixed(1) : ""
    ),
    (r.equity * 100).toFixed(1),
    r.ev.toFixed(2),
    advantageText(r.buckets, 1),
    advantageText(r.buckets, 2),
  ]);
  return [header, ...lines].map((line) => line.join(",")).join("\n");
};

/** Share of the `top` best equity tranches IP holds over OOP (positive: IP has the edge). */
const advantageValue = (
  buckets: [number[], number[]] | null,
  top: number
): number | null => {
  if (!buckets) return null;
  const [oop, ip] = buckets.map((b) =>
    b.slice(0, top).reduce((sum, x) => sum + x, 0)
  );
  return ip - oop;
};

/** Ranks of a flop, highest first, as one comparable number. */
const flopOrder = (board: number[]) =>
  [...board]
    .map((card) => card >>> 2)
    .sort((a, b) => b - a)
    .reduce((n, rank) => n * 13 + rank, 0);

/**
 * Sorted copy of the rows by a column: "flop", "texture", "weight", "equity", "ev", "nut"
 * (IP minus OOP at 90%+), "best" (75%+), or an action ("Bet:7"). Rows without the value come
 * last; equal values keep their order.
 */
export const sortReportRows = (
  rows: ReportRow[],
  key: string,
  descending: boolean
): ReportRow[] => {
  const value = (r: ReportRow): number | string | null => {
    switch (key) {
      case "flop":
        return flopOrder(r.board);
      case "texture":
        return r.texture;
      case "weight":
        return r.weight;
      case "equity":
        return r.equity;
      case "ev":
        return r.ev;
      case "nut":
        return advantageValue(r.buckets, 1);
      case "best":
        return advantageValue(r.buckets, 2);
      default:
        return r.strategy ? (r.strategy[key] ?? 0) : null;
    }
  };
  const sign = descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    if (x === null || y === null)
      return Number(x === null) - Number(y === null);
    if (typeof x === "string" || typeof y === "string") {
      return sign * String(x).localeCompare(String(y));
    }
    return sign * (x - y);
  });
};
