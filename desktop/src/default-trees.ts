// The trees shipped in the Trees tab ("Default" folder), added once to the library.
// Sizes measured with the app's solver (sizing lab, November 2026): per street, a small size
// and a big one; see docs/superpowers/specs/2026-11-23-default-trees-design.md.

import * as Db from "./db";
import type { DbGroup, DbItem } from "./db";
import { BET_FIELDS, type BetField } from "./bet-fields";
import { rowFor, rowPath } from "./saved-items";
import type { ConfigValue } from "./tree-config-value";

type Row = DbItem | DbGroup;

/** Raise it to add trees shipped by a later version (only missing ones are added). */
export const DEFAULT_TREES_VERSION = 1;
const STORAGE_KEY = "postflop-lab.default-trees";
const FOLDER = "Default";

type Streets = { flop: string; turn: string; river: string };

const tree = (t: {
  pot: number;
  stack: number;
  oop: Streets;
  ip: Streets;
  oopRaise: string;
  ipRaise: string;
  /** Turn and river raises ("" = none). */
  laterRaise: string;
  /** OOP donk sizes on the turn and river; null = the OOP bet sizes. */
  donk: { turn: string; river: string } | null;
}): ConfigValue => {
  const sizes: Record<BetField, string> = {
    oopFlopBet: t.oop.flop,
    oopFlopRaise: t.oopRaise,
    oopTurnBet: t.oop.turn,
    oopTurnRaise: t.laterRaise,
    oopTurnDonk: t.donk?.turn ?? "",
    oopRiverBet: t.oop.river,
    oopRiverRaise: t.laterRaise,
    oopRiverDonk: t.donk?.river ?? "",
    ipFlopBet: t.ip.flop,
    ipFlopRaise: t.ipRaise,
    ipTurnBet: t.ip.turn,
    ipTurnRaise: t.laterRaise,
    ipRiverBet: t.ip.river,
    ipRiverRaise: t.laterRaise,
  };
  return {
    startingPot: t.pot,
    effectiveStack: t.stack,
    // NL50 rake: 5%, capped at 6 big blinds.
    rakePercent: 5,
    rakeCap: 60,
    donkOption: t.donk ? 1 : 0,
    ...(Object.fromEntries(BET_FIELDS.map((f) => [f, sizes[f]])) as Record<
      BetField,
      string
    >),
    addAllInThreshold: 150,
    forceAllInThreshold: 20,
    mergingThreshold: 10,
    expectedBoardLength: 0,
    addedLines: "",
    removedLines: "",
  };
};

const SRP = { pot: 55, stack: 975 };
const THREE_BET_OOP = { pot: 275, stack: 865 };
const THREE_BET_IP = { pot: 175, stack: 920 };

/** The simplified single raised pot, also the Setup's default sizes. */
export const SRP_SIMPLIFIED = tree({
  ...SRP,
  ip: { flop: "33, 75", turn: "75", river: "75, 150" },
  oop: { flop: "", turn: "33, 150", river: "33, 150" },
  ipRaise: "60",
  oopRaise: "4x",
  laterRaise: "",
  donk: { turn: "33", river: "33" },
});

export const DEFAULT_TREES: { path: string[]; value: ConfigValue }[] = [
  {
    path: [FOLDER, "SRP, opener IP"],
    value: tree({
      ...SRP,
      ip: { flop: "33, 75", turn: "75, 150", river: "75, 150" },
      oop: { flop: "", turn: "33, 150", river: "33, 150" },
      ipRaise: "60",
      oopRaise: "4x",
      laterRaise: "60",
      donk: { turn: "33", river: "33, 150" },
    }),
  },
  { path: [FOLDER, "SRP, opener IP (simplified)"], value: SRP_SIMPLIFIED },
  {
    path: [FOLDER, "3-bet pot, 3-bettor OOP"],
    value: tree({
      ...THREE_BET_OOP,
      oop: { flop: "25, 60", turn: "25, 115", river: "33, 125" },
      ip: { flop: "33", turn: "33, 100", river: "33, 125" },
      oopRaise: "60",
      ipRaise: "3x",
      laterRaise: "60",
      donk: null,
    }),
  },
  {
    path: [FOLDER, "3-bet pot, 3-bettor OOP (simplified)"],
    value: tree({
      ...THREE_BET_OOP,
      oop: { flop: "33", turn: "25, 115", river: "33, 125" },
      ip: { flop: "33", turn: "33", river: "33, 125" },
      oopRaise: "60",
      ipRaise: "3x",
      laterRaise: "",
      donk: null,
    }),
  },
  {
    path: [FOLDER, "3-bet pot, 3-bettor IP"],
    value: tree({
      ...THREE_BET_IP,
      ip: { flop: "25, 60", turn: "33, 100", river: "33, 125" },
      oop: { flop: "33", turn: "33, 150", river: "33, 150" },
      ipRaise: "60",
      oopRaise: "2.5x",
      laterRaise: "60",
      donk: { turn: "33", river: "33, 150" },
    }),
  },
  {
    path: [FOLDER, "3-bet pot, 3-bettor IP (simplified)"],
    value: tree({
      ...THREE_BET_IP,
      ip: { flop: "25, 60", turn: "33, 100", river: "33, 125" },
      oop: { flop: "", turn: "33, 150", river: "33, 150" },
      ipRaise: "60",
      oopRaise: "2.5x",
      laterRaise: "",
      donk: { turn: "33", river: "33" },
    }),
  },
];

/** Rows to add to `existing`: the folder if missing, and each tree whose path is free. */
export const defaultTreeRows = (existing: Row[]): Row[] => {
  const taken = new Set(existing.map((row) => JSON.stringify(rowPath(row))));
  // A saved tree (not a folder) already named like the folder: the trees would have no
  // parent and stay invisible, so add nothing.
  const atFolder = existing.find(
    (row) => JSON.stringify(rowPath(row)) === JSON.stringify([FOLDER])
  );
  if (atFolder && atFolder.isGroup === 0) return [];
  const rows: Row[] = [];
  if (!atFolder) rows.push(rowFor([FOLDER], true));
  for (const { path, value } of DEFAULT_TREES) {
    if (!taken.has(JSON.stringify(path))) rows.push(rowFor(path, false, value));
  }
  return rows;
};

/**
 * Adds the default trees once (per `DEFAULT_TREES_VERSION`): a tree deleted or changed by the
 * user is never touched again. A failed write leaves it to the next start.
 */
export const seedDefaultTrees = (
  storage: Pick<Storage, "getItem" | "setItem">
): Promise<void> => {
  // One at a time: two overlapping seeds would both read an empty library and write twice.
  seeding ??= seed(storage).finally(() => (seeding = null));
  return seeding;
};

let seeding: Promise<void> | null = null;

const seed = async (storage: Pick<Storage, "getItem" | "setItem">) => {
  if (Number(storage.getItem(STORAGE_KEY) ?? 0) >= DEFAULT_TREES_VERSION)
    return;
  const rows = defaultTreeRows(await Db.getArray("configurations"));
  if (rows.length > 0 && !(await Db.bulkAdd("configurations", rows))) return;
  storage.setItem(STORAGE_KEY, String(DEFAULT_TREES_VERSION));
};
