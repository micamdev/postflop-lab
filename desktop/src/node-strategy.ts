// Overall strategy of the player acting at a node: how often each action is taken.

import { average } from "./utils";

export type StrategyItem = {
  name: string;
  amount: string;
  /** Bet or raise size in % of the pot, if known. */
  percent: number | null;
  color: string;
  frequency: number;
  /** Weighted number of combos taking the action (absent for an average over flops). */
  combos?: number;
};

/**
 * Per action `i`, the average of `strategy[i * n .. (i + 1) * n]` weighted by `normalizer`
 * (`n` hands), and the number of combos taking it (range `weights`); null when the player has no hand left at the node.
 */
export const nodeStrategy = (
  strategy: number[],
  normalizer: number[],
  actions: {
    name: string;
    amount: string;
    percent?: number | null;
    color: string;
  }[],
  weights: number[]
): StrategyItem[] | null => {
  const n = normalizer.length;
  if (n === 0 || normalizer.reduce((sum, w) => sum + w, 0) <= 0) return null;
  return actions.map(({ name, amount, percent, color }, i) => ({
    name,
    amount,
    percent: percent ?? null,
    color,
    frequency: average(strategy.slice(i * n, (i + 1) * n), normalizer),
    // Hands the opponent fully blocks (normalizer 0) are not counted, as in the Summary.
    combos: weights.reduce(
      (sum, w, h) => sum + (normalizer[h] > 0 ? w * strategy[i * n + h] : 0),
      0
    ),
  }));
};
