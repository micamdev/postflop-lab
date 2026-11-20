import { describe, expect, test } from "vitest";
import type { DbGroup, DbItem } from "./db";
import {
  FolderNode,
  SavedNode,
  buildFolderTree,
  checkJsonItems,
  invalidSpots,
  isUnder,
  renamedPath,
  rowFor,
  saveTargets,
  sourcesAfterOverwrite,
  visibleRows,
  filterFolderTree,
  itemsToAdd,
  nameTaken,
  toJsonItems,
} from "./saved-items";

const group = (...path: string[]): DbGroup => ({
  name0: path[0],
  name1: path[1] ?? "",
  name2: path[2] ?? "",
  name3: path[3] ?? "",
  isGroup: 1,
});
const item = (value: unknown, ...path: string[]): DbItem => ({
  name0: path[0],
  name1: path[1] ?? "",
  name2: path[2] ?? "",
  name3: path[3] ?? "",
  isGroup: 0,
  value,
});

const rows = [
  item("AA", "BTN open"),
  group("100bb"),
  group("100bb", "SRP"),
  item("KK", "100bb", "SRP", "BB vs BTN call"),
  item("QQ", "100bb", "BB10"),
  item("JJ", "100bb", "BB9"),
  group("100bb", "SRP", "Deep"),
  item("TT", "100bb", "SRP", "Deep", "BB vs CO"),
  group("3bet pots"),
  item("99", "3bet pots", "SB vs BTN"),
];

const names = (nodes: SavedNode[]) => nodes.map((n) => n.name);
const folder = (nodes: SavedNode[], name: string) =>
  nodes.find((n) => n.kind === "folder" && n.name === name) as FolderNode;

describe("buildFolderTree", () => {
  test("nests four levels, folders first, natural sort", () => {
    const tree = buildFolderTree(rows);
    expect(names(tree)).toEqual(["3bet pots", "100bb", "BTN open"]);
    const bb = folder(tree, "100bb");
    expect(names(bb.children)).toEqual(["SRP", "BB9", "BB10"]);
    const deep = folder(folder(bb.children, "SRP").children, "Deep");
    expect(deep.children[0]).toEqual({
      kind: "item",
      name: "BB vs CO",
      path: ["100bb", "SRP", "Deep", "BB vs CO"],
      value: "TT",
    });
  });
});

describe("filterFolderTree", () => {
  test("keeps matches with their ancestors", () => {
    const tree = filterFolderTree(buildFolderTree(rows), "bb vs");
    expect(names(tree)).toEqual(["100bb"]);
    const srp = folder(folder(tree, "100bb").children, "SRP");
    expect(names(srp.children)).toEqual(["Deep", "BB vs BTN call"]);
  });

  test("a matching folder keeps all its children", () => {
    const tree = filterFolderTree(buildFolderTree(rows), "3BET");
    expect(names(folder(tree, "3bet pots").children)).toEqual(["SB vs BTN"]);
  });

  test("filterFolderTree with no match", () => {
    expect(filterFolderTree(buildFolderTree(rows), "zzz")).toEqual([]);
  });

  test("an empty query keeps everything", () => {
    expect(filterFolderTree(buildFolderTree(rows), "  ")).toEqual(
      buildFolderTree(rows)
    );
  });
});

describe("nameTaken", () => {
  test("item, folder or free", () => {
    const tree = buildFolderTree(rows);
    expect(nameTaken(tree, ["100bb"], "BB9")).toBe("item");
    expect(nameTaken(tree, ["100bb"], "SRP")).toBe("folder");
    expect(nameTaken(tree, ["100bb"], "BB8")).toBeNull();
    expect(nameTaken(tree, [], "BTN open")).toBe("item");
  });
});

describe("JSON import and export", () => {
  test("checkJsonItems accepts an export and rejects broken data", () => {
    const exported = toJsonItems(buildFolderTree(rows));
    expect(checkJsonItems("ranges", exported)).toBe(true);
    expect(checkJsonItems("configurations", exported)).toBe(false);
    expect(checkJsonItems("ranges", [{ isGroup: false, value: "AA" }])).toBe(
      false
    );
    expect(
      checkJsonItems("ranges", [
        { path: ["a", "b", "c", "d", "e"], isGroup: false, value: "AA" },
      ])
    ).toBe(false);
    // An item whose folder is not in the file.
    expect(
      checkJsonItems("ranges", [
        { path: ["x", "y"], isGroup: false, value: "AA" },
      ])
    ).toBe(false);
  });

  test("export then import into an empty library gives the same rows", () => {
    const exported = toJsonItems(buildFolderTree(rows));
    const added = itemsToAdd(exported, []);
    expect(Array.isArray(added)).toBe(true);
    const sortKey = (r: DbItem | DbGroup) =>
      [r.name0, r.name1, r.name2, r.name3, r.isGroup].join("/");
    expect((added as (DbItem | DbGroup)[]).map(sortKey).sort()).toEqual(
      rows.map(sortKey).sort()
    );
  });

  test("itemsToAdd skips identical items and renames different ones", () => {
    const data = [
      { path: ["BTN open"], isGroup: false, value: "AA" },
      { path: ["100bb"], isGroup: true },
      { path: ["100bb", "BB9"], isGroup: false, value: "22" },
    ];
    expect(itemsToAdd(data, rows)).toEqual([item("22", "100bb", "BB9 (2)")]);
  });

  test("itemsToAdd reports a group that collides with an item", () => {
    const data = [{ path: ["BTN open"], isGroup: true }];
    expect(itemsToAdd(data, rows)).toBe("BTN open");
  });
});

describe("explorer helpers", () => {
  test("visibleRows lists open folders' content with depths", () => {
    const tree = buildFolderTree(rows);
    const open = new Set([JSON.stringify(["100bb"])]);
    const visible = visibleRows(tree, (path) => open.has(JSON.stringify(path)));
    expect(visible.map((r) => [r.node.name, r.depth])).toEqual([
      ["3bet pots", 0],
      ["100bb", 0],
      ["SRP", 1],
      ["BB9", 1],
      ["BB10", 1],
      ["BTN open", 0],
    ]);
  });

  test("renamedPath follows a renamed folder or item", () => {
    expect(renamedPath(["100bb", "SRP", "BB"], ["100bb"], "200bb")).toEqual([
      "200bb",
      "SRP",
      "BB",
    ]);
    expect(renamedPath(["100bb", "BB9"], ["100bb", "BB9"], "BB 9")).toEqual([
      "100bb",
      "BB 9",
    ]);
    expect(renamedPath(["3bet pots", "X"], ["100bb"], "200bb")).toEqual([
      "3bet pots",
      "X",
    ]);
  });

  test("isUnder", () => {
    expect(isUnder(["100bb", "SRP", "BB"], ["100bb"])).toBe(true);
    expect(isUnder(["100bb"], ["100bb"])).toBe(true);
    expect(isUnder(["100bbb"], ["100bb"])).toBe(false);
  });

  test("rowFor builds a database row from a path", () => {
    expect(rowFor(["100bb", "SRP"], true)).toEqual(group("100bb", "SRP"));
    expect(rowFor(["BTN open"], false, "AA")).toEqual(item("AA", "BTN open"));
  });
});

describe("saveTargets", () => {
  test("each tab saves its own kind of item", () => {
    expect(saveTargets("ranges").map((t) => t.label)).toEqual([
      "OOP range",
      "IP range",
    ]);
    expect(saveTargets("configurations").map((t) => t.label)).toEqual([
      "Tree config",
    ]);
  });
});

describe("saveTargets with a fold range being edited", () => {
  test("the fold range can be saved too", () => {
    expect(saveTargets("ranges", 3)).toEqual([
      { label: "OOP range", target: 0 },
      { label: "IP range", target: 1 },
      { label: "Fold range", target: 3 },
    ]);
    expect(saveTargets("ranges", null)).toHaveLength(2);
    expect(saveTargets("configurations", 3)).toEqual([
      { label: "Tree config", target: "tree" },
    ]);
  });
});

describe("sourcesAfterOverwrite", () => {
  test("another range that came from the overwritten item is marked modified", () => {
    const x = { path: ["X"], modified: false };
    const y = { path: ["Y"], modified: false };
    // IP saved over "X", which OOP had been loaded from.
    expect(sourcesAfterOverwrite([x, null], 1, ["X"])).toEqual([
      { path: ["X"], modified: true },
      { path: ["X"], modified: false },
    ]);
    expect(sourcesAfterOverwrite([y, null], 1, ["X"])).toEqual([
      y,
      { path: ["X"], modified: false },
    ]);
  });
});

describe("sourcesAfterOverwrite with a fold range", () => {
  test("saving a fold range over an item marks the range that came from it", () => {
    const x = { path: ["X"], modified: false };
    expect(sourcesAfterOverwrite([x, null], 3, ["X"])).toEqual([
      { path: ["X"], modified: true },
      null,
    ]);
  });
});

/* Spots */
const spotValue = {
  oopRange: "AA,KK",
  ipRange: "QQ",
  startingPot: 275,
  effectiveStack: 865,
  rakePercent: 5,
  rakeCap: 150,
  line: "BTN 2.5 · BB 13.5 · BTN call",
  positions: ["BB", "BTN"],
};

test("a spots export holds objects", () => {
  expect(
    checkJsonItems("spots", [
      { path: ["P"], isGroup: true },
      { path: ["P", "S"], isGroup: false, value: spotValue },
    ])
  ).toBe(true);
  expect(
    checkJsonItems("spots", [
      { path: ["P"], isGroup: true },
      { path: ["P", "S"], isGroup: false, value: "AA" },
    ])
  ).toBe(false);
});

test("invalid spots are listed with their path", () => {
  expect(
    invalidSpots([
      { path: ["P"], isGroup: true },
      { path: ["P", "Good"], isGroup: false, value: spotValue },
      {
        path: ["P", "Bad"],
        isGroup: false,
        value: { ...spotValue, startingPot: 0 },
      },
    ])
  ).toEqual([{ path: ["P", "Bad"], reason: expect.any(String) }]);
});

test("spots are not saved from the current setup", () => {
  expect(saveTargets("spots")).toEqual([]);
});
