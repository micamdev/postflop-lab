// Flop subsets for batch solving: the 1755 flops distinct up to the suits, and representative
// subsets of them. The weights keep each suits × pairing class's exact share; inside a class
// the flops are spread over the ranks, so heights and connectedness are only approximated
// (closer as the subset grows).

import { canonicalFlop, flopTexture } from "./flop-texture";

export type WeightedFlop = {
  /** Three cards (4 * rank + suit), highest first. */
  board: number[];
  /** Number of the 22100 flops this one stands for. */
  weight: number;
};

/** Subset sizes offered for a batch (1755: every flop). */
export const SUBSET_SIZES = [25, 49, 95, 184, 1755] as const;

let cache: WeightedFlop[] | null = null;

/** The 1755 flops distinct up to the suits, with how many flops each stands for. */
export const allFlops = (): WeightedFlop[] => {
  if (cache) return cache;
  const counts = new Map<string, WeightedFlop>();
  for (let a = 0; a < 52; ++a) {
    for (let b = a + 1; b < 52; ++b) {
      for (let c = b + 1; c < 52; ++c) {
        const board = canonicalFlop([a, b, c]);
        const key = board.join(",");
        const entry = counts.get(key);
        if (entry) entry.weight++;
        else counts.set(key, { board, weight: 1 });
      }
    }
  }
  cache = [...counts.values()].sort(
    (x, y) =>
      y.board[0] - x.board[0] ||
      y.board[1] - x.board[1] ||
      y.board[2] - x.board[2]
  );
  return cache;
};

/** Texture class of a flop: suits × pairing. */
export const classOf = (board: number[]) => {
  const t = flopTexture(board);
  return `${t.suits}/${t.pairing}`;
};

/** Which of the three cards (highest first) share a suit: "abc", "aab", "aba", "abb", "aaa". */
const suitPattern = (board: number[]) => {
  const letters = new Map<number, string>();
  return board
    .map((card) => {
      const suit = card & 3;
      if (!letters.has(suit)) letters.set(suit, "abc"[letters.size]);
      return letters.get(suit);
    })
    .join("");
};

/** How different two flops are: their ranks, and which cards share a suit. */
const distance = (x: number[], y: number[]) =>
  x.reduce((sum, card, i) => sum + Math.abs((card >>> 2) - (y[i] >>> 2)), 0) +
  (suitPattern(x) === suitPattern(y) ? 0 : 2);

/** Splits `n` over classes in proportion to their weights (at least 1 each, at most their size). */
const allocate = (classes: WeightedFlop[][], n: number) => {
  const total = classes.reduce(
    (s, c) => s + c.reduce((t, f) => t + f.weight, 0),
    0
  );
  const exact = classes.map(
    (c) => (n * c.reduce((t, f) => t + f.weight, 0)) / total
  );
  const counts = exact.map((x, i) =>
    Math.min(classes[i].length, Math.max(1, Math.floor(x)))
  );
  // Largest remainders first, then (if over) remove from the largest counts.
  const byRemainder = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  let sum = counts.reduce((s, x) => s + x, 0);
  for (let k = 0; sum < n; k = (k + 1) % byRemainder.length) {
    const { i } = byRemainder[k];
    if (counts[i] < classes[i].length) {
      counts[i]++;
      sum++;
    }
  }
  while (sum > n) {
    const i = counts.indexOf(Math.max(...counts));
    counts[i]--;
    sum--;
  }
  return counts;
};

/** `m` flops of a class at even steps of its cumulative weight (flops sorted by ranks). */
const pickSpread = (flops: WeightedFlop[], m: number) => {
  const total = flops.reduce((s, f) => s + f.weight, 0);
  const picked = new Set<number>();
  let index = 0;
  let cumulative = 0;
  for (let k = 0; k < m; ++k) {
    const target = ((k + 0.5) * total) / m;
    while (
      index < flops.length - 1 &&
      cumulative + flops[index].weight <= target
    ) {
      cumulative += flops[index].weight;
      index++;
    }
    let i = index;
    while (picked.has(i)) i = (i + 1) % flops.length;
    picked.add(i);
  }
  return [...picked].sort((a, b) => a - b);
};

const subsetCache = new Map<number, WeightedFlop[]>();

/**
 * `n` flops standing for all of them: each texture class (suits × pairing) gets flops in
 * proportion to how often it occurs, spread over its ranks; every flop of the class is then
 * counted with the nearest chosen one. Deterministic. `n` = 1755 gives every flop.
 */
export const representativeFlops = (n: number): WeightedFlop[] => {
  const all = allFlops();
  if (n >= all.length) return all;
  const cached = subsetCache.get(n);
  if (cached) return cached;
  const groups = new Map<string, WeightedFlop[]>();
  for (const flop of all) {
    const key = classOf(flop.board);
    const group = groups.get(key);
    if (group) group.push(flop);
    else groups.set(key, [flop]);
  }
  const classes = [...groups.keys()].sort().map((key) => groups.get(key)!);
  // At least one flop per class.
  const counts = allocate(classes, Math.max(n, classes.length));

  const subset = classes.flatMap((flops, c) => {
    const picks = pickSpread(flops, counts[c]).map((i) => ({
      board: flops[i].board,
      weight: 0,
    }));
    for (const flop of flops) {
      let best = picks[0];
      let bestDistance = Infinity;
      for (const pick of picks) {
        const d = distance(flop.board, pick.board);
        if (d < bestDistance) {
          best = pick;
          bestDistance = d;
        }
      }
      best.weight += flop.weight;
    }
    return picks;
  });
  subsetCache.set(n, subset);
  return subset;
};
