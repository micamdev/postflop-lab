// Sorting and filtering the solutions of the Library.

import type { LibraryEntry, SolutionMeta } from "./invokes";
import { cardText } from "./utils";

export type SortKey =
  "name" | "board" | "date" | "depth" | "exploitability" | "size";

const DEPTH_ORDER = { flop: 0, turn: 1, river: 2 };

const boardText = (meta: SolutionMeta) =>
  meta.board
    .map((card) => cardText(card).rank + cardText(card).suitLetter)
    .join("");

/** Exploitability in % of the pot (as shown in the Library). */
const exploitabilityPercent = (meta: SolutionMeta) => {
  const pot = Number(meta.tree_config.startingPot) || 0;
  return pot > 0 ? (meta.exploitability * 100) / pot : meta.exploitability;
};

const compareMeta = (a: SolutionMeta, b: SolutionMeta, key: SortKey) => {
  switch (key) {
    case "board":
      return boardText(a).localeCompare(boardText(b));
    case "date":
      return a.created_at - b.created_at;
    case "depth":
      return DEPTH_ORDER[a.depth] - DEPTH_ORDER[b.depth];
    case "exploitability":
      return exploitabilityPercent(a) - exploitabilityPercent(b);
    default:
      return 0;
  }
};

/** Sorted copy; entries that cannot be read always come last. */
export const sortEntries = (
  entries: LibraryEntry[],
  key: SortKey,
  descending: boolean
): LibraryEntry[] => {
  const sign = descending ? -1 : 1;
  const byName = (a: LibraryEntry, b: LibraryEntry) =>
    a.name.localeCompare(b.name, undefined, { numeric: true });
  return [...entries].sort((a, b) => {
    if (!a.meta || !b.meta) {
      return Number(!a.meta) - Number(!b.meta) || byName(a, b);
    }
    if (key === "name") return sign * byName(a, b);
    if (key === "size") return sign * (a.file_size - b.file_size);
    return sign * compareMeta(a.meta, b.meta, key) || byName(a, b);
  });
};

const fold = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toLowerCase();

/** Entries whose name or board ("Jh9d4c", spaces ignored) contains `query`. */
export const filterEntries = (
  entries: LibraryEntry[],
  query: string
): LibraryEntry[] => {
  const q = fold(query);
  if (q === "") return entries;
  return entries.filter(
    (entry) =>
      fold(entry.name).includes(q) ||
      (entry.meta !== null && fold(boardText(entry.meta)).includes(q))
  );
};

/** Files whose body failed to load, by name, with their size then (and the error). */
export type FailedLoads = Map<string, { size: number; error: string }>;

/**
 * Entries with each file that failed to load shown as unreadable. The listing only reads the
 * header, so a file truncated in its body looks fine until loaded. A file saved again under
 * that name (another size) is listed normally.
 */
export const withFailedLoads = (
  entries: LibraryEntry[],
  failed: FailedLoads
): LibraryEntry[] =>
  entries.map((entry) => {
    const failure = failed.get(entry.name);
    return failure && failure.size === entry.file_size
      ? { ...entry, meta: null, error: failure.error }
      : entry;
  });

/** Start of the error of a load that failed while reading the file's body. */
export const DAMAGED_FILE =
  "The solution could not be read (the file may be damaged)";

/**
 * Records the outcome of loading `entry`: a damaged file is marked (shown as unreadable, Open
 * still offered to retry), a successful load clears its mark. Other errors (not enough
 * memory, solver running) say nothing about the file.
 */
export const noteLoad = (
  failed: FailedLoads,
  entry: LibraryEntry,
  error: string | null
) => {
  if (error === null) {
    failed.delete(entry.name);
  } else if (error.startsWith(DAMAGED_FILE)) {
    failed.set(entry.name, {
      size: entry.file_size,
      error: error.slice(DAMAGED_FILE.length + 2),
    });
  }
};
