import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./db", () => ({ getArray: vi.fn(), bulkAdd: vi.fn() }));

import * as Db from "./db";
import type { DbGroup, DbItem } from "./db";
import {
  DEFAULT_TREES,
  DEFAULT_TREES_VERSION,
  defaultTreeRows,
  seedDefaultTrees,
} from "./default-trees";
import { BET_FIELDS, isRaiseField } from "./bet-fields";
import { configToValue, applyConfigValue } from "./tree-config-value";
import { emptySetup } from "./store";
import { rowPath } from "./saved-items";
import { sanitizeBetString } from "./utils";

const mocked = vi.mocked(Db);

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getArray.mockResolvedValue([]);
  mocked.bulkAdd.mockResolvedValue(true);
});

describe("the default trees", () => {
  test("six trees in a Default folder", () => {
    expect(DEFAULT_TREES.map((t) => t.path)).toEqual([
      ["Default", "SRP, opener IP"],
      ["Default", "SRP, opener IP (simplified)"],
      ["Default", "3-bet pot, 3-bettor OOP"],
      ["Default", "3-bet pot, 3-bettor OOP (simplified)"],
      ["Default", "3-bet pot, 3-bettor IP"],
      ["Default", "3-bet pot, 3-bettor IP (simplified)"],
    ]);
  });

  test("every size is valid and every tree has the NL50 rake", () => {
    for (const { path, value } of DEFAULT_TREES) {
      for (const field of BET_FIELDS) {
        const r = sanitizeBetString(value[field], isRaiseField(field));
        expect(r.valid, `${path.join("/")} ${field}: ${r.s}`).toBe(true);
      }
      expect([value.rakePercent, value.rakeCap]).toEqual([5, 60]);
    }
  });

  test("each value is a saved tree as the app saves it (same keys, same order)", () => {
    for (const { value } of DEFAULT_TREES) {
      const setup = { ...emptySetup(), donkOption: false };
      applyConfigValue(setup, value);
      expect(Object.keys(value)).toEqual(Object.keys(configToValue(setup)));
      expect(configToValue(setup)).toEqual(value);
    }
  });
});

const item = (path: string[], value: unknown): DbItem => ({
  name0: path[0],
  name1: path[1] ?? "",
  name2: "",
  name3: "",
  isGroup: 0,
  value,
});
const group = (name: string): DbGroup => ({
  name0: name,
  name1: "",
  name2: "",
  name3: "",
  isGroup: 1,
});

describe("defaultTreeRows", () => {
  test("an empty library gets the folder and the six trees", () => {
    const rows = defaultTreeRows([]);
    expect(rows.map(rowPath)).toEqual([
      ["Default"],
      ...DEFAULT_TREES.map((t) => t.path),
    ]);
  });

  test("only what is missing is added; a tree already there is left alone", () => {
    const changed = item(["Default", "SRP, opener IP"], { mine: true });
    const rows = defaultTreeRows([group("Default"), changed]);
    expect(rows.map(rowPath)).toEqual(
      DEFAULT_TREES.slice(1).map((t) => t.path)
    );
  });
});

describe("seedDefaultTrees", () => {
  test("adds the trees once, then remembers it", async () => {
    const storage = memoryStorage();
    await seedDefaultTrees(storage);
    expect(mocked.bulkAdd).toHaveBeenCalledOnce();
    expect(mocked.bulkAdd.mock.calls[0][0]).toBe("configurations");
    expect(storage.getItem("postflop-lab.default-trees")).toBe(
      String(DEFAULT_TREES_VERSION)
    );

    await seedDefaultTrees(storage);
    expect(mocked.bulkAdd).toHaveBeenCalledOnce();
  });

  test("a failed write does not mark it done (retried next time)", async () => {
    mocked.bulkAdd.mockResolvedValue(false);
    const storage = memoryStorage();
    await seedDefaultTrees(storage);
    expect(storage.getItem("postflop-lab.default-trees")).toBeNull();
  });

  test("nothing missing: no write, but marked done", async () => {
    mocked.getArray.mockResolvedValue(defaultTreeRows([]));
    const storage = memoryStorage();
    await seedDefaultTrees(storage);
    expect(mocked.bulkAdd).not.toHaveBeenCalled();
    expect(storage.getItem("postflop-lab.default-trees")).toBe(
      String(DEFAULT_TREES_VERSION)
    );
  });
});

describe("review fixes", () => {
  test("a saved tree named Default (not a folder): nothing is added", () => {
    expect(defaultTreeRows([item(["Default"], { mine: true })])).toEqual([]);
  });

  test("two seeds at once write once", async () => {
    let release!: () => void;
    mocked.getArray.mockReturnValue(
      new Promise((r) => (release = () => r([])))
    );
    const storage = memoryStorage();
    const both = Promise.all([
      seedDefaultTrees(storage),
      seedDefaultTrees(storage),
    ]);
    release();
    await both;
    expect(mocked.bulkAdd).toHaveBeenCalledOnce();
  });
});
