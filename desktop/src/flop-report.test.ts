import { describe, expect, test } from "vitest";
import type { LibraryEntry, SolutionMeta } from "./invokes";
import {
  advantageText,
  averageRow,
  buildReport,
  configKey,
  defaultCbetBy,
  sortReportRows,
  reportActions,
  reportCsv,
  reportRows,
} from "./flop-report";

// Cards: 4 * rank + suit (c d h s). As = 51, Kd = 45, 7c = 20; 8h = 26, 7h = 22, 6d = 17.
const AK7 = [51, 45, 20];
const EIGHT76 = [26, 22, 17];

const meta = (
  board: number[],
  overrides: Partial<SolutionMeta> = {},
  summary: Partial<SolutionMeta["summary"]> = {}
): SolutionMeta => ({
  schema: 3,
  app_version: "test",
  created_at: 0,
  board,
  ranges: ["AA,KK", "QQ-99"],
  tree_config: { board, startingPot: 20, oopFlopBet: "33%" },
  depth: "flop",
  exploitability: 0.1,
  iterations: 100,
  precision: "32",
  locks: [],
  summary: {
    equity: [0.45, 0.55],
    ev: [8, 12],
    root_player: "oop",
    root_actions: ["Check:0", "Bet:7"],
    root_frequencies: [0.9, 0.1],
    equity_buckets: [
      [0.1, 0.2, 0.3, 0.4],
      [0.2, 0.2, 0.3, 0.3],
    ],
    ip_after_check: { actions: ["Check:0", "Bet:7"], frequencies: [0.4, 0.6] },
    ...summary,
  },
  ...overrides,
});

const entry = (name: string, m: SolutionMeta | null): LibraryEntry => ({
  name,
  file_size: 1,
  meta: m,
  error: m ? null : "unreadable",
});

describe("configKey", () => {
  test("the same spot on another flop has the same key", () => {
    expect(configKey(meta(AK7))).toBe(configKey(meta(EIGHT76)));
  });

  test("ranges, tree and locks make another spot; precision and depth do not", () => {
    const key = configKey(meta(AK7));
    expect(configKey(meta(AK7, { ranges: ["AA", "QQ-99"] }))).not.toBe(key);
    expect(
      configKey(
        meta(AK7, {
          tree_config: { board: AK7, startingPot: 30, oopFlopBet: "33%" },
        })
      )
    ).not.toBe(key);
    expect(configKey(meta(AK7, { locks: [{ key: "x" } as never] }))).not.toBe(
      key
    );
    expect(configKey(meta(AK7, { precision: "16", depth: "river" }))).toBe(key);
  });

  test("key order in the tree config does not matter", () => {
    const a = meta(AK7, {
      tree_config: { startingPot: 20, oopFlopBet: "33%" },
    });
    const b = meta(AK7, {
      tree_config: { oopFlopBet: "33%", startingPot: 20 },
    });
    expect(configKey(a)).toBe(configKey(b));
  });
});

describe("defaultCbetBy", () => {
  test("IP after check when OOP can check first, else OOP", () => {
    expect(defaultCbetBy(meta(AK7))).toBe("ip");
    expect(
      defaultCbetBy(
        meta(
          AK7,
          {},
          { root_actions: ["Bet:7", "Allin:100"], ip_after_check: null }
        )
      )
    ).toBe("oop");
  });
});

describe("reportRows", () => {
  const entries = [
    entry("BTN AK7", meta(AK7)),
    entry(
      "BTN 876",
      meta(
        EIGHT76,
        {},
        {
          ip_after_check: {
            actions: ["Check:0", "Bet:7", "Allin:100"],
            frequencies: [0.5, 0.3, 0.2],
          },
        }
      )
    ),
    entry("other spot", meta(AK7, { ranges: ["AA", "KK"] })),
    entry("broken", null),
    entry("turn board", meta([...AK7, 0])),
  ];

  test("the flops of the same spot, with the c-bettor's values", () => {
    const rows = reportRows(entries, configKey(meta(AK7)), "ip");
    expect(rows.map((r) => r.name)).toEqual(["BTN AK7", "BTN 876"]);
    expect(rows[0]).toMatchObject({
      board: AK7,
      texture: "A high, rainbow",
      weight: 24,
      equity: 0.55,
      ev: 12,
      strategy: { "Check:0": 0.4, "Bet:7": 0.6 },
    });
  });

  test("OOP first: the root strategy and OOP's values", () => {
    const [row] = reportRows(entries, configKey(meta(AK7)), "oop");
    expect(row).toMatchObject({
      equity: 0.45,
      ev: 8,
      strategy: { "Check:0": 0.9, "Bet:7": 0.1 },
    });
  });

  test("a batch weight wins over the suit count; an older save has no strategy", () => {
    const rows = reportRows(
      [
        entry("a", meta(AK7, { flop_weight: 60 })),
        entry(
          "b",
          meta(
            EIGHT76,
            { schema: 2 },
            { ip_after_check: undefined, equity_buckets: undefined }
          )
        ),
      ],
      configKey(meta(AK7)),
      "ip"
    );
    expect(rows[0].weight).toBe(60);
    expect(rows[1].strategy).toBeNull();
    expect(rows[1].buckets).toBeNull();
  });

  test("actions: the union, checks first then bets by amount", () => {
    const rows = reportRows(entries, configKey(meta(AK7)), "ip");
    expect(reportActions(rows)).toEqual(["Check:0", "Bet:7", "Allin:100"]);
  });
});

describe("averageRow", () => {
  test("weighted by how often each flop occurs; a missing action counts 0", () => {
    const rows = reportRows(
      [
        entry("a", meta(AK7, { flop_weight: 3 })),
        entry(
          "b",
          meta(
            EIGHT76,
            { flop_weight: 1 },
            {
              equity: [0.5, 0.5],
              ev: [10, 4],
              ip_after_check: {
                actions: ["Check:0", "Allin:100"],
                frequencies: [1, 0],
              },
            }
          )
        ),
      ],
      configKey(meta(AK7)),
      "ip"
    );
    const avg = averageRow(rows);
    expect(avg.equity).toBeCloseTo((0.55 * 3 + 0.5) / 4);
    expect(avg.ev).toBeCloseTo((12 * 3 + 4) / 4);
    expect(avg.strategy!["Check:0"]).toBeCloseTo((0.4 * 3 + 1) / 4);
    expect(avg.strategy!["Bet:7"]).toBeCloseTo((0.6 * 3) / 4);
    expect(avg.strategy!["Allin:100"]).toBeCloseTo(0);
  });

  test("rows without a strategy are left out of the strategy average", () => {
    const rows = reportRows(
      [
        entry("a", meta(AK7)),
        entry("b", meta(EIGHT76, {}, { ip_after_check: null })),
      ],
      configKey(meta(AK7)),
      "ip"
    );
    expect(averageRow(rows).strategy!["Bet:7"]).toBeCloseTo(0.6);
  });
});

describe("advantageText", () => {
  test("who has more of the top tranches, by how many points", () => {
    const oop = [0.1, 0.2, 0.3, 0.4];
    const ip = [0.2, 0.2, 0.3, 0.3];
    expect(advantageText([oop, ip], 1)).toBe("IP +10.0");
    expect(advantageText([oop, ip], 2)).toBe("IP +10.0");
    expect(advantageText([ip, oop], 1)).toBe("OOP +10.0");
    expect(advantageText([oop, [0.105, 0.2, 0.3, 0.395]], 1)).toBe("None");
    expect(advantageText(null, 1)).toBe("—");
  });
});

describe("reportCsv", () => {
  test("one line per flop, frequencies in %", () => {
    const rows = reportRows(
      [entry("a", meta(AK7))],
      configKey(meta(AK7)),
      "ip"
    );
    const csv = reportCsv(rows, reportActions(rows)).split("\n");
    expect(csv[0]).toBe(
      "Flop,Texture,Weight,Check %,Bet 7 %,Equity %,EV,Nut advantage,Best hands advantage"
    );
    expect(csv[1]).toBe(
      'AsKd7c,"A high, rainbow",24,40.0,60.0,55.0,12.00,IP +10.0,IP +10.0'
    );
  });
});

describe("sortReportRows", () => {
  const rows = reportRows(
    [
      entry("a", meta(AK7)),
      entry(
        "b",
        meta(
          EIGHT76,
          {},
          {
            equity: [0.5, 0.6],
            ip_after_check: {
              actions: ["Check:0", "Bet:7"],
              frequencies: [0.9, 0.1],
            },
          }
        )
      ),
      entry("c", meta([50, 42, 0], {}, { ip_after_check: null })),
    ],
    configKey(meta(AK7)),
    "ip"
  );

  test("by an action, rows without strategy last", () => {
    const names = (key: string, desc: boolean) =>
      sortReportRows(rows, key, desc).map((r) => r.name);
    expect(names("Bet:7", true)).toEqual(["a", "b", "c"]);
    expect(names("Bet:7", false)).toEqual(["b", "a", "c"]);
  });

  test("by equity; by flop, highest cards first", () => {
    expect(sortReportRows(rows, "equity", true).map((r) => r.name)).toEqual([
      "b",
      "a",
      "c",
    ]);
    // Ah Qh 2c (c) < As Kd 7c (a); 8h 7h 6d (b) lowest.
    expect(sortReportRows(rows, "flop", true).map((r) => r.name)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
});

describe("review follow-ups", () => {
  const key = configKey(meta(AK7));

  test("only saves older than schema 3 need an update", () => {
    const { rows } = buildReport(
      [
        entry("old", meta(AK7, { schema: 2 }, { ip_after_check: undefined })),
        // Schema 3, OOP never checks: nothing to update.
        entry("never checks", meta(EIGHT76, {}, { ip_after_check: null })),
      ],
      key,
      "ip"
    );
    expect(rows.map((r) => [r.name, r.isOlderSave])).toEqual([
      ["old", true],
      ["never checks", false],
    ]);
  });

  test("one row per flop up to the suits: a batch row first, else the most recent", () => {
    const AhKc7d = [50, 44, 21];
    const report = buildReport(
      [
        entry("hand old", meta(AK7, { created_at: 1 })),
        entry("hand new", meta(AhKc7d, { created_at: 3 })),
        entry(
          "batch",
          meta(AhKc7d, { created_at: 2, flop_weight: 400, batch_size: 49 })
        ),
        entry("876", meta(EIGHT76, { created_at: 5 })),
        entry("876 again", meta(EIGHT76, { created_at: 6 })),
      ],
      key,
      "ip"
    );
    expect(report.rows.map((r) => r.name)).toEqual(["batch", "876 again"]);
    expect(report.duplicates).toBe(3);
  });

  test("with batch flops, the average is over them only", () => {
    const { rows } = buildReport(
      [
        entry("batch", meta(AK7, { flop_weight: 400, batch_size: 49 })),
        entry("hand", meta(EIGHT76, {}, { equity: [0, 0] })),
      ],
      key,
      "ip"
    );
    expect(rows.map((r) => r.inAverage)).toEqual([true, false]);
    expect(averageRow(rows).equity).toBeCloseTo(0.55);
  });

  test("without batch flops, every row is in the average", () => {
    const { rows } = buildReport(
      [entry("a", meta(AK7)), entry("b", meta(EIGHT76))],
      key,
      "ip"
    );
    expect(rows.every((r) => r.inAverage)).toBe(true);
  });
});

describe("subsets", () => {
  const key = configKey(meta(AK7));
  const QQ2 = [43, 42, 0];

  test("the average uses one subset (the largest), and says how complete it is", () => {
    const report = buildReport(
      [
        entry("b25 AK7", meta(AK7, { flop_weight: 800, batch_size: 25 })),
        entry("b49 876", meta(EIGHT76, { flop_weight: 400, batch_size: 49 })),
        entry(
          "b49 QQ2",
          meta(QQ2, { flop_weight: 450, batch_size: 49 }, { equity: [0, 0] })
        ),
      ],
      key,
      "ip"
    );
    expect(report.subset).toEqual({ size: 49, solved: 2 });
    expect(report.rows.map((r) => [r.name, r.inAverage])).toEqual([
      ["b25 AK7", false],
      ["b49 876", true],
      ["b49 QQ2", true],
    ]);
  });

  test("a flop in two subsets: the row of the subset used for the average is kept", () => {
    const report = buildReport(
      [
        entry(
          "b49",
          meta(AK7, { flop_weight: 400, batch_size: 49, created_at: 1 })
        ),
        entry(
          "b25",
          meta(AK7, { flop_weight: 800, batch_size: 25, created_at: 2 })
        ),
      ],
      key,
      "ip"
    );
    expect(report.rows.map((r) => r.name)).toEqual(["b49"]);
  });

  test("no batch: no subset", () => {
    expect(buildReport([entry("a", meta(AK7))], key, "ip").subset).toBeNull();
  });
});
