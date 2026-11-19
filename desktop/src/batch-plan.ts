// Which flops a batch solves, and under which names.

import type { LibraryEntry } from "./invokes";
import { boardText, configKey } from "./flop-report";
import { canonicalFlopKey } from "./flop-texture";
import type { WeightedFlop } from "./flop-subsets";

export type BatchFlop = WeightedFlop & { name: string };

/**
 * The flops of a batch for the spot `key`: those already saved for this spot (up to the
 * suits) are skipped, so a stopped batch resumes where it was. Each is saved as
 * "prefix AsKd7c", with " (2)", " (3)"... if the name is taken.
 */
export const planBatch = (
  entries: LibraryEntry[],
  key: string,
  flops: WeightedFlop[],
  prefix: string
): { toSolve: BatchFlop[]; skipped: number } => {
  const done = new Set(
    entries.flatMap((e) =>
      e.meta && e.meta.board.length === 3 && configKey(e.meta) === key
        ? [canonicalFlopKey(e.meta.board)]
        : []
    )
  );
  // File names are case-insensitive on Windows.
  const taken = new Set(entries.map((e) => e.name.toLowerCase()));
  const toSolve: BatchFlop[] = [];
  for (const flop of flops) {
    if (done.has(canonicalFlopKey(flop.board))) continue;
    const base = `${prefix} ${boardText(flop.board)}`.trim();
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); ++n) name = `${base} (${n})`;
    taken.add(name.toLowerCase());
    toSolve.push({ ...flop, name });
  }
  return { toSolve, skipped: flops.length - toSolve.length };
};
