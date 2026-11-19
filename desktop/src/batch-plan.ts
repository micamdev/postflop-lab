// Which flops a batch solves, and under which names.

import type { LibraryEntry } from "./invokes";
import { boardText, configKey } from "./flop-report";
import { canonicalFlopKey } from "./flop-texture";
import { classOf, type WeightedFlop } from "./flop-subsets";

const ALL_FLOPS = 1755;

export type BatchFlop = WeightedFlop & { name: string };

/**
 * The flops of a batch of the subset of `size` for the spot `key`: those already saved by a
 * batch of this subset for this spot (up to the suits) are skipped, so a stopped batch resumes
 * where it was. A flop solved in another subset is solved again (its weight would not fit
 * this one); one solved by hand too, except for every flop (1755), where its weight is the
 * same. Each texture class is spread over the batch, so a stopped batch stays representative.
 * Each is saved as "prefix AsKd7c", with " (2)", " (3)"... if the name is taken.
 */
export const planBatch = (
  entries: LibraryEntry[],
  key: string,
  flops: WeightedFlop[],
  size: number,
  prefix: string
): { toSolve: BatchFlop[]; skipped: number } => {
  const done = new Set(
    entries.flatMap((e) =>
      e.meta &&
      e.meta.board.length === 3 &&
      (e.meta.batch_size === size ||
        (size === ALL_FLOPS && e.meta.batch_size === null)) &&
      configKey(e.meta) === key
        ? [canonicalFlopKey(e.meta.board)]
        : []
    )
  );
  // File names are case-insensitive on Windows.
  const taken = new Set(entries.map((e) => e.name.toLowerCase()));
  const toSolve: BatchFlop[] = [];
  for (const flop of spread(flops)) {
    if (done.has(canonicalFlopKey(flop.board))) continue;
    const base = `${prefix} ${boardText(flop.board)}`.trim();
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); ++n) name = `${base} (${n})`;
    taken.add(name.toLowerCase());
    toSolve.push({ ...flop, name });
  }
  return { toSolve, skipped: flops.length - toSolve.length };
};

/**
 * The flops reordered so that each texture class is spread evenly over the list (the k-th
 * of a class of n at about (k + 0.5) / n of the way): any prefix keeps the class shares.
 */
const spread = (flops: WeightedFlop[]): WeightedFlop[] => {
  const counts = new Map<string, number>();
  for (const f of flops)
    counts.set(classOf(f.board), (counts.get(classOf(f.board)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return flops
    .map((flop, i) => {
      const c = classOf(flop.board);
      const k = seen.get(c) ?? 0;
      seen.set(c, k + 1);
      return { flop, at: (k + 0.5) / counts.get(c)!, i };
    })
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.flop);
};
