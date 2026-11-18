import { describe, expect, test } from "vitest";
import type { LibraryEntry, SolutionMeta } from "./invokes";
import {
  DAMAGED_FILE,
  filterEntries,
  noteLoad,
  sortEntries,
  withFailedLoads,
} from "./library-list";

// Cards: 4 * rank + suit (c d h s); Jh = 38, 9d = 29, 4c = 8, As = 51.
const entry = (
  name: string,
  meta: Partial<SolutionMeta> | null,
  size = 100
): LibraryEntry => ({
  name,
  file_size: size,
  meta:
    meta &&
    ({
      created_at: 0,
      board: [38, 29, 8],
      depth: "river",
      exploitability: 0.1,
      tree_config: { startingPot: 20 },
      precision: "32",
      ...meta,
    } as SolutionMeta),
  error: meta ? null : "unreadable",
});

const a = entry("Spot 10", { created_at: 300 }, 50);
const b = entry("Spot 2", { created_at: 100, board: [51, 29, 8] }, 300);
const c = entry("BTN SRP", { created_at: 200 }, 200);
const broken = entry("broken", null, 10);
const names = (list: LibraryEntry[]) => list.map((e) => e.name);

describe("sortEntries", () => {
  test("natural name order", () => {
    expect(names(sortEntries([a, b, c], "name", false))).toEqual([
      "BTN SRP",
      "Spot 2",
      "Spot 10",
    ]);
  });

  test("date both ways, and size", () => {
    expect(names(sortEntries([a, b, c], "date", true))).toEqual([
      "Spot 10",
      "BTN SRP",
      "Spot 2",
    ]);
    expect(names(sortEntries([a, b, c], "date", false))).toEqual([
      "Spot 2",
      "BTN SRP",
      "Spot 10",
    ]);
    expect(names(sortEntries([a, b, c], "size", false))).toEqual([
      "Spot 10",
      "BTN SRP",
      "Spot 2",
    ]);
  });

  test("unreadable entries sort last", () => {
    expect(names(sortEntries([broken, a, b], "date", false)).at(-1)).toBe(
      "broken"
    );
    expect(names(sortEntries([broken, a, b], "date", true)).at(-1)).toBe(
      "broken"
    );
    expect(
      names(sortEntries([a, broken, b], "exploitability", true)).at(-1)
    ).toBe("broken");
  });

  test("does not change its input", () => {
    const list = [a, b, c];
    sortEntries(list, "name", false);
    expect(names(list)).toEqual(["Spot 10", "Spot 2", "BTN SRP"]);
  });
});

describe("filterEntries", () => {
  test("filterEntries matches name and board", () => {
    expect(names(filterEntries([a, b, c], "srp"))).toEqual(["BTN SRP"]);
    expect(names(filterEntries([a, b, c], "jh9D"))).toEqual([
      "Spot 10",
      "BTN SRP",
    ]);
    expect(names(filterEntries([a, b, c], "Jh 9d"))).toEqual([
      "Spot 10",
      "BTN SRP",
    ]);
  });

  test("filter keeps unreadable entries matching by name", () => {
    expect(names(filterEntries([a, broken], "brok"))).toEqual(["broken"]);
  });

  test("an empty query keeps everything", () => {
    expect(filterEntries([a, b, broken], " ")).toHaveLength(3);
  });

  test("accents are ignored", () => {
    const e = entry("Équilibre", { created_at: 1 });
    expect(names(filterEntries([e], "equi"))).toEqual(["Équilibre"]);
  });
});

describe("withFailedLoads", () => {
  test("a file that failed to load is listed as unreadable", () => {
    const failed = new Map([["Spot 10", { size: 50, error: "truncated" }]]);
    const [first, second] = withFailedLoads([a, b], failed);
    expect(first).toEqual({ ...a, meta: null, error: "truncated" });
    expect(second).toBe(b);
  });

  test("a file saved again under that name is listed normally", () => {
    const failed = new Map([["Spot 10", { size: 999, error: "truncated" }]]);
    expect(withFailedLoads([a], failed)).toEqual([a]);
  });
});

describe("noteLoad", () => {
  test("a damaged file is marked, a successful load clears the mark", () => {
    const failed = new Map();
    noteLoad(failed, a, `${DAMAGED_FILE}: truncated`);
    expect(failed.get("Spot 10")).toEqual({ size: 50, error: "truncated" });
    noteLoad(failed, a, null);
    expect(failed.has("Spot 10")).toBe(false);
  });

  test("other errors (not enough memory) do not mark the file", () => {
    const failed = new Map();
    noteLoad(failed, a, "Not enough memory");
    expect(failed.size).toBe(0);
  });
});
