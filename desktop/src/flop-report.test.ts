import { describe, expect, test } from "vitest";
import type { LibraryEntry, SolutionMeta } from "./invokes";
import { allFlops } from "./flop-subsets";
import {
  advantageText,
  averageRow,
  buildReport,
  chartBar,
  chartZero,
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

  test("a listed solution (a key of its locks, no locks) matches the same spot built in the app", () => {
    const built = configKey(meta(AK7, { locks: [] }));
    expect(configKey(meta(AK7, { locks: [], locks_key: "" }))).toBe(built);
    const lockedA = configKey(meta(AK7, { locks: [], locks_key: "ab12-1" }));
    expect(lockedA).not.toBe(built);
    expect(configKey(meta(EIGHT76, { locks: [], locks_key: "ab12-1" }))).toBe(
      lockedA
    );
    expect(configKey(meta(AK7, { locks: [], locks_key: "cd34-1" }))).not.toBe(
      lockedA
    );
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
      equity: [0.45, 0.55],
      ev: [8, 12],
      strategy: { "Check:0": 0.4, "Bet:7": 0.6 },
    });
    // EQR: EV / (pot × equity), the pot of 20 at the root.
    expect(rows[0].eqr[0]).toBeCloseTo(8 / (20 * 0.45));
    expect(rows[0].eqr[1]).toBeCloseTo(12 / (20 * 0.55));
  });

  test("OOP first: the root strategy and OOP's values", () => {
    const [row] = reportRows(entries, configKey(meta(AK7)), "oop");
    expect(row).toMatchObject({
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
    expect(avg.equity[1]).toBeCloseTo((0.55 * 3 + 0.5) / 4);
    expect(avg.ev[1]).toBeCloseTo((12 * 3 + 4) / 4);
    // The EQR of the averages, not the average of the EQRs.
    expect(avg.eqr[1]).toBeCloseTo(avg.ev[1] / (20 * avg.equity[1]));
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
      "Flop,Texture,Weight,Check %,Bet 7 %,EV OOP,EV IP,Equity OOP %,Equity IP %,EQR OOP %,EQR IP %,Nut advantage,Best hands advantage"
    );
    expect(csv[1]).toBe(
      'AsKd7c,"A high, rainbow",24,40.0,60.0,8.00,12.00,45.0,55.0,88.9,109.1,IP +10.0,IP +10.0'
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
    expect(sortReportRows(rows, "eq1", true).map((r) => r.name)).toEqual([
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
    expect(averageRow(rows).equity[1]).toBeCloseTo(0.55);
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

  test("a flop in two subsets: the row of the subset used for the average is kept (the more complete one)", () => {
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
    // 1 of 25 flops is more complete than 1 of 49.
    expect(report.rows.map((r) => r.name)).toEqual(["b25"]);
  });

  test("no batch: no subset", () => {
    expect(buildReport([entry("a", meta(AK7))], key, "ip").subset).toBeNull();
  });
});

describe("chartBar", () => {
  test("no negative value: bars from the bottom, the largest one full", () => {
    expect(chartBar("ev", 5, [5, 10])).toEqual({ bottom: 0, height: 0.5 });
    expect(chartBar("eq", 0.4, [0.4])).toEqual({ bottom: 0, height: 0.4 });
  });

  test("negative values hang below a zero line", () => {
    // From -5 to 15: the zero line at a quarter of the height.
    expect(chartBar("ev", 15, [15, -5])).toEqual({
      bottom: 0.25,
      height: 0.75,
    });
    expect(chartBar("ev", -5, [15, -5])).toEqual({ bottom: 0, height: 0.25 });
    // All negative: the zero line on top.
    expect(chartBar("ev", -2, [-2, -4])).toEqual({ bottom: 0.5, height: 0.5 });
  });

  test("a value it cannot draw: no bar", () => {
    expect(chartBar("ev", Number.NaN, [1])).toEqual({ bottom: 0, height: 0 });
  });

  test("the zero line, when values go below it", () => {
    expect(chartZero("ev", [15, -5])).toBe(0.25);
    expect(chartZero("ev", [1, 2])).toBeNull();
  });
});

describe("audit follow-ups", () => {
  const key = configKey(meta(AK7));
  const QQ2 = [43, 42, 0];

  test("the average uses the most complete subset, not a barely started larger one", () => {
    const report = buildReport(
      [
        entry("b25 a", meta(AK7, { flop_weight: 800, batch_size: 25 })),
        entry("b25 b", meta(EIGHT76, { flop_weight: 900, batch_size: 25 })),
        entry("b184", meta(QQ2, { flop_weight: 100, batch_size: 184 })),
      ],
      key,
      "ip"
    );
    expect(report.subset).toEqual({ size: 25, solved: 2 });
  });

  test("with every flop solved (1755), hand-solved flops count too", () => {
    const { rows } = buildReport(
      [
        entry("batch", meta(AK7, { flop_weight: 24, batch_size: 1755 })),
        entry("hand", meta(EIGHT76)),
      ],
      key,
      "ip"
    );
    expect(rows.every((r) => r.inAverage)).toBe(true);
  });

  test("a nearly finished larger subset (95%+) wins over a complete smaller one", () => {
    const flops = allFlops().slice(0, 21);
    const report = buildReport(
      [
        ...flops
          .slice(0, 19)
          .map((f, i) =>
            entry(
              `b20 ${i}`,
              meta(f.board, { flop_weight: f.weight, batch_size: 20 })
            )
          ),
        ...flops
          .slice(19)
          .map((f, i) =>
            entry(
              `b2 ${i}`,
              meta(f.board, { flop_weight: f.weight, batch_size: 2 })
            )
          ),
      ],
      key,
      "ip"
    );
    expect(report.subset).toEqual({ size: 20, solved: 19 });
  });

  test("with 1755, a hand-solved flop beats another subset's row and counts in the share", () => {
    const flops = allFlops();
    // 1600 batch flops + 100 hand-solved ones: 1700/1755 (96.9%), over a complete 2-flop batch.
    const entries = [
      ...flops
        .slice(0, 1600)
        .map((f, i) =>
          entry(
            `all ${i}`,
            meta(f.board, { flop_weight: f.weight, batch_size: 1755 })
          )
        ),
      ...flops
        .slice(1600, 1700)
        .map((f, i) => entry(`hand ${i}`, meta(f.board))),
      ...flops
        .slice(1690, 1692)
        .map((f, i) =>
          entry(
            `b2 ${i}`,
            meta(f.board, { flop_weight: f.weight, batch_size: 2 })
          )
        ),
    ];
    const report = buildReport(entries, key, "ip");
    expect(report.subset).toEqual({ size: 1755, solved: 1700 });
    // Flops 1690 and 1691: hand-solved and in the 2-flop batch; the hand row is kept.
    const kept = report.rows.filter((r) => r.batchSize === 2);
    expect(kept).toHaveLength(0);
    expect(report.rows.every((r) => r.inAverage)).toBe(true);
  });

  test("the same spot whatever extra keys or spaces its tree config has", () => {
    const base = meta(AK7);
    const extra = meta(AK7, {
      tree_config: { ...base.tree_config, someOldField: 1, oopFlopBet: "33% " },
    });
    expect(configKey(extra)).toBe(configKey(base));
  });

  test("texture sort: by suits, pairing and connectedness, then highest cards", () => {
    // Js 8d 2c and Ts 8d 2c rainbow; As Ks 7d two-tone.
    const rows = reportRows(
      [
        entry("two-tone A", meta([51, 47, 21])),
        entry("rainbow T", meta([35, 25, 0])),
        entry("rainbow J", meta([39, 25, 0])),
      ],
      key,
      "ip"
    );
    expect(sortReportRows(rows, "texture", false).map((r) => r.name)).toEqual([
      "rainbow J",
      "rainbow T",
      "two-tone A",
    ]);
  });
});

test("a solution's spot line does not split a report", () => {
  const spot = {
    name: "S",
    line: "BTN 2.5 · BB call",
    positions: ["BB", "BTN"],
    modified: false,
  };
  expect(
    configKey(
      meta(AK7, {
        tree_config: { board: AK7, startingPot: 20, oopFlopBet: "33%", spot },
      })
    )
  ).toBe(configKey(meta(AK7)));
});
