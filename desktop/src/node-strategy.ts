// Overall strategy of the player acting at a node: how often each action is taken.

import { average } from "./utils";

export type StrategyItem = {
  name: string;
  amount: string;
  color: string;
  frequency: number;
};

/**
 * Per action `i`, the average of `strategy[i * n .. (i + 1) * n]` weighted by `normalizer`
 * (`n` hands); null when the player has no hand left at the node.
 */
export const nodeStrategy = (
  strategy: number[],
  normalizer: number[],
  actions: { name: string; amount: string; color: string }[]
): StrategyItem[] | null => {
  const n = normalizer.length;
  if (n === 0 || normalizer.reduce((sum, w) => sum + w, 0) <= 0) return null;
  return actions.map(({ name, amount, color }, i) => ({
    name,
    amount,
    color,
    frequency: average(strategy.slice(i * n, (i + 1) * n), normalizer),
  }));
};
