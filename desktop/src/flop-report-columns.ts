// The flop report's table: its columns, and the cells of a row (or of the average) after the
// strategy bar. Pure: the colors are given.

import { actionLabel, type averageRow } from "./flop-report";
import { toFixed1, toFixed2 } from "./utils";

export type Column = {
  key: string;
  label: string;
  numeric?: boolean;
  title?: string;
};

/** What a row and the average both have. */
export type Values = Pick<
  ReturnType<typeof averageRow>,
  "strategy" | "equity" | "ev" | "eqr" | "buckets"
>;

export type Cell = {
  key: string;
  text: string;
  numeric?: boolean;
  /** A bar filling `ratio` of the cell, in `color`. */
  fill?: { ratio: number; color: string };
};

/** "45.0%", or "—" without a value. */
export const percentText = (value: number | undefined) =>
  value === undefined || isNaN(value) ? "—" : toFixed1(value * 100) + "%";

/** "20.50", or "—" without a value. */
export const evText = (value: number) => (isNaN(value) ? "—" : toFixed2(value));

/** Flop, texture, advantages, strategy, each action, then EV, EQ and EQR of each player. */
export const reportColumns = (actions: string[]): Column[] => [
  { key: "flop", label: "Flop" },
  { key: "texture", label: "Texture" },
  {
    key: "nut",
    label: "Nut adv.",
    title: "Who holds more of the hands with 90%+ equity, by how many points",
  },
  {
    key: "best",
    label: "Best hands",
    title: "Who holds more of the hands with 75%+ equity, by how many points",
  },
  { key: "strategy", label: "Strategy" },
  ...actions.map((a) => ({ key: a, label: actionLabel(a), numeric: true })),
  ...(["EV", "EQ", "EQR"] as const).flatMap((name) =>
    (["OOP", "IP"] as const).map((who, p) => ({
      key: `${name.toLowerCase()}${p}`,
      label: `${name} ${who}`,
      numeric: true,
      title: `${who}'s ${name === "EQ" ? "equity" : name} at the root`,
    }))
  ),
];

/** The cells after the strategy bar: actions, then EV, EQ, EQR (OOP then IP). */
export const valueCells = (
  v: Values,
  actions: string[],
  colors: Record<string, string>,
  playerColors: [string, string]
): Cell[] => [
  ...actions.map((a) => {
    const frequency = v.strategy ? (v.strategy[a] ?? 0) : null;
    return {
      key: a,
      text: frequency === null ? "—" : percentText(frequency),
      numeric: true,
      fill:
        frequency === null ? undefined : { ratio: frequency, color: colors[a] },
    };
  }),
  ...[0, 1].map((p) => ({
    key: `ev${p}`,
    text: evText(v.ev[p]),
    numeric: true,
  })),
  ...[0, 1].map((p) => ({
    key: `eq${p}`,
    text: percentText(v.equity[p]),
    numeric: true,
    fill: { ratio: v.equity[p], color: playerColors[p] },
  })),
  ...[0, 1].map((p) => ({
    key: `eqr${p}`,
    text: percentText(v.eqr[p]),
    numeric: true,
    // 200% fills the cell.
    fill: { ratio: v.eqr[p] / 2, color: playerColors[p] },
  })),
];
