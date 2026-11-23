import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// The Tauri boundary: every game command the session calls.
vi.mock("./invokes", () => ({
  gameInit: vi.fn(),
  gameSolveEstimate: vi.fn(),
  gameSolveLimit: vi.fn(),
  gameMemoryUsage: vi.fn(),
  gameMemoryUsageBunching: vi.fn(),
  memory: vi.fn(),
  osName: vi.fn(),
  setNumThreads: vi.fn(),
  gameAllocateMemory: vi.fn(),
  gameSetBunching: vi.fn(),
  gameExploitability: vi.fn(),
  gameSolveStep: vi.fn(),
  gameFinalize: vi.fn(),
}));

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};
vi.stubGlobal("localStorage", memoryStorage());

import * as invokes from "./invokes";
import { useConfigStore, useStore } from "./store";
import {
  checkConfig,
  memoryLimit,
  solveBlocker,
  useSolverSession,
} from "./solver-session";

const GB = 1024 * 1024 * 1024;
const mocked = vi.mocked(invokes);

/** A promise resolved from the outside. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

/** Lets pending promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  mocked.gameInit.mockResolvedValue("");
  mocked.gameSolveEstimate.mockResolvedValue({
    need32: GB,
    need16: GB / 2,
    bunching: 0,
    limit: 8 * GB,
  });
  mocked.gameMemoryUsage.mockResolvedValue([GB, GB / 2]);
  mocked.gameMemoryUsageBunching.mockResolvedValue(0);
  mocked.memory.mockResolvedValue([8 * GB, 16 * GB]);
  mocked.osName.mockResolvedValue("windows");
  mocked.setNumThreads.mockResolvedValue(undefined);
  mocked.gameAllocateMemory.mockResolvedValue(undefined);
  mocked.gameExploitability.mockResolvedValue(0.01);
  mocked.gameSolveStep.mockResolvedValue(undefined);
  mocked.gameFinalize.mockResolvedValue(undefined);
  Object.assign(useConfigStore(), {
    board: [0, 5, 10],
    startingPot: 20,
    effectiveStack: 100,
  });
});

/** The app holds a finished solution loaded from a partial save. */
const withLoadedPartialSolution = () => {
  const store = useStore();
  store.isSolverFinished = true;
  store.isSolutionSaved = true;
  store.solutionDepth = "turn";
  store.solutionInfo = {
    name: "Jh 9d 4c",
    loaded: true,
    iterations: 100,
    exploitability: 0.1,
  };
  return store;
};

describe("solve", () => {
  test("old results are hidden while the tree is rebuilt", async () => {
    const store = withLoadedPartialSolution();
    const init = deferred<string>();
    mocked.gameInit.mockReturnValue(init.promise);

    const solving = useSolverSession().solve();
    await flush();
    expect(store.isSolverFinished).toBe(false);

    init.resolve("");
    await solving;
  });

  test("a failed tree build never offers to save", async () => {
    const store = withLoadedPartialSolution();
    mocked.gameInit.mockResolvedValue("OOP range is empty");
    const session = useSolverSession();

    await session.solve();

    expect(session.message).toBe("OOP range is empty");
    expect(store.isSolverFinished).toBe(false);
    expect(session.canSave).toBe(false);
  });

  test("a second solve during the start is ignored", async () => {
    const store = useStore();
    const init = deferred<string>();
    mocked.gameInit.mockReturnValue(init.promise);
    const session = useSolverSession();

    const first = session.solve();
    await flush();
    expect(store.isSolveStarting).toBe(true);
    await session.solve();
    expect(mocked.gameInit).toHaveBeenCalledTimes(1);

    init.resolve("");
    await first;
    expect(store.isSolveStarting).toBe(false);
  });

  test("an invoke error stops the solve with an error", async () => {
    const store = useStore();
    mocked.gameExploitability.mockResolvedValue(10);
    mocked.gameSolveStep.mockRejectedValue("Game is not ready");
    const session = useSolverSession();

    await session.solve();

    expect(store.isSolverRunning).toBe(false);
    expect(store.isSolverPaused).toBe(false);
    expect(store.isFinalizing).toBe(false);
    expect(store.isSolverError).toBe(true);
    expect(session.message).toContain("Game is not ready");
  });
});

describe("runLockedSolve", () => {
  test("invalid settings refuse the locked solve without getting stuck", async () => {
    const store = useStore();
    const session = useSolverSession();
    session.settings.threads = "" as unknown as number;
    // The valid setting was applied when the session started; only the solve matters here.
    await flush();
    mocked.setNumThreads.mockClear();

    await session.runLockedSolve(false);

    expect(mocked.setNumThreads).not.toHaveBeenCalled();
    expect(store.isSolverRunning).toBe(false);
    expect(store.isSolverError).toBe(true);
    expect(session.message).not.toBe("");
  });
});

describe("messages", () => {
  test("the fallback message keeps the bunching warning", async () => {
    const store = useStore();
    store.isBunchingEnabled = true; // data not ready: solving without it
    mocked.gameSolveEstimate.mockResolvedValue({
      need32: 10 * GB,
      need16: 2 * GB,
      bunching: 0,
      limit: 8 * GB,
    });
    const session = useSolverSession();

    await session.solve();

    expect(session.message).toContain("Bunching effect is on");
    expect(session.message).toContain("16-bit");
    expect(mocked.gameAllocateMemory).toHaveBeenCalledWith(true);
  });
});

describe("audit fixes", () => {
  test("a rejected tree build does not leave Solve disabled", async () => {
    mocked.gameInit.mockRejectedValue("invalid type: string, expected f64");
    const session = useSolverSession();
    await session.solve();
    expect(useStore().isSolverError).toBe(true);
    expect(session.isBuilding).toBe(false);
  });

  test("Solve waits for both ranges and a valid setup", () => {
    const config = useConfigStore();
    const ranges = useStore().ranges;
    ranges[0].fill(0);
    ranges[1].fill(0);
    ranges[1][0] = 100;
    expect(solveBlocker(config, ranges)).toBe("The OOP range is empty.");
    ranges[0][5] = 50;
    ranges[1].fill(0);
    expect(solveBlocker(config, ranges)).toBe("The IP range is empty.");
    ranges[1][0] = 100;
    expect(solveBlocker(config, ranges)).toBeNull();
    const board = config.board;
    config.board = [];
    expect(solveBlocker(config, ranges)).toContain("Board");
    config.board = board;
  });

  test("empty or out-of-range rake and thresholds are refused", () => {
    const config = useConfigStore();
    for (const [field, value] of [
      ["rakeCap", ""],
      ["rakeCap", Number.NaN],
      ["rakePercent", 101],
      ["rakePercent", ""],
      ["addAllInThreshold", ""],
      ["forceAllInThreshold", Number.NaN],
      ["mergingThreshold", ""],
    ] as const) {
      const saved = (config as unknown as Record<string, unknown>)[field];
      (config as unknown as Record<string, unknown>)[field] = value;
      expect(checkConfig(config), `${field} = ${value}`).not.toBeNull();
      (config as unknown as Record<string, unknown>)[field] = saved;
    }
    expect(checkConfig(config)).toBeNull();
  });

  test("the stop target uses the solved pot, not an edited Setup pot", async () => {
    mocked.gameExploitability.mockResolvedValue(10); // 50% of the solved pot (20)
    const session = useSolverSession();
    session.settings.targetExploitability = 1;
    session.settings.maxIterations = 1000;
    let steps = 0;
    mocked.gameSolveStep.mockImplementation(async () => {
      if (++steps === 5) session.pause();
    });
    await session.solve();
    expect(useStore().isSolverPaused).toBe(true);
    useConfigStore().startingPot = 2000;
    mocked.gameSolveStep.mockImplementation(async () => {
      if (++steps === 20) session.pause();
    });
    await session.resume();
    expect(useStore().isSolverFinished).toBe(false);
    expect(session.iteration).toBeGreaterThan(5);
  });

  test("an unknown memory size (0) does not block the solve", async () => {
    mocked.memory.mockResolvedValue([0, 0]);
    const session = useSolverSession();
    await session.solve();
    expect(mocked.gameAllocateMemory).toHaveBeenCalled();
  });

  test("turning bunching on after a solve does not block saving it", async () => {
    const session = useSolverSession();
    await session.solve();
    const store = useStore();
    store.isBunchingEnabled = true;
    store.bunchingFlop = [0, 5, 10];
    expect(session.saveDisabledReason).toBe("");
  });

  test("a bunching flop mismatch is refused before the previous solution is replaced", async () => {
    const store = useStore();
    store.isSolverFinished = true;
    store.isBunchingEnabled = true;
    store.bunchingFlop = [1, 2, 3];
    const session = useSolverSession();
    await session.solve();
    expect(mocked.gameInit).not.toHaveBeenCalled();
    expect(store.isSolverFinished).toBe(true);
  });

  test("the thread setting is applied when it changes", async () => {
    const session = useSolverSession();
    session.settings.threads = 3;
    await flush();
    expect(mocked.setNumThreads).toHaveBeenCalledWith(3);
  });
});

describe("audit review fixes", () => {
  test("only valid thread counts reach the engine, never during a bunching run", async () => {
    const session = useSolverSession();
    await flush();
    mocked.setNumThreads.mockClear();
    session.settings.threads = 128;
    await flush();
    expect(mocked.setNumThreads).not.toHaveBeenCalled();
    useStore().isBunchingRunning = true;
    session.settings.threads = 4;
    await flush();
    expect(mocked.setNumThreads).not.toHaveBeenCalled();
  });

  test("Stop while paused with an invalid thread count still finalizes", async () => {
    mocked.gameExploitability.mockResolvedValue(10);
    const session = useSolverSession();
    session.settings.targetExploitability = 1;
    let steps = 0;
    mocked.gameSolveStep.mockImplementation(async () => {
      if (++steps === 3) session.pause();
    });
    await session.solve();
    expect(useStore().isSolverPaused).toBe(true);
    // The field cleared during the pause (v-model.number gives "").
    (session.settings as { threads: unknown }).threads = "";
    mocked.setNumThreads.mockClear();
    mocked.setNumThreads.mockRejectedValue("invalid type: string");
    session.stop();
    await flush();
    await flush();
    expect(mocked.setNumThreads).not.toHaveBeenCalled();
    expect(useStore().isSolverError).toBe(false);
    expect(mocked.gameFinalize).toHaveBeenCalled();
  });

  test("a short board with bunching data reports the board", async () => {
    const store = useStore();
    store.isBunchingEnabled = true;
    store.bunchingFlop = [1, 2, 3];
    useConfigStore().board = [1];
    const session = useSolverSession();
    await session.solve();
    expect(session.message).toBe("Board must consist of at least three cards");
  });

  test("an unknown memory size counts as unlimited", async () => {
    mocked.gameSolveLimit.mockResolvedValue(2 ** 64); // u64::MAX
    expect(await memoryLimit()).toBe(Number.POSITIVE_INFINITY);
  });

  test("the Setup estimate uses the limit Solve uses (what the open solution frees)", async () => {
    mocked.memory.mockResolvedValue([GB, 16 * GB]);
    mocked.gameSolveLimit.mockResolvedValue(9 * GB);
    expect(await memoryLimit()).toBe(9 * GB);
  });
});

describe("spots", () => {
  test("the solve records the spot as it is when the tree is built", async () => {
    const store = useStore();
    const config = useConfigStore();
    store.spot = {
      path: ["S"],
      name: "S",
      value: {
        oopRange: "AA",
        ipRange: "KK",
        startingPot: 20,
        effectiveStack: 90,
        rakePercent: 0,
        rakeCap: 0,
        line: "BTN 2.5 · BB call",
        positions: ["BB", "BTN"],
      },
      rangesEdited: false,
    };
    // The stack was changed after loading the spot (100 instead of 90).
    await useSolverSession().solve();
    expect(store.solvedSpot).toEqual({
      name: "S",
      line: "BTN 2.5 · BB call",
      positions: ["BB", "BTN"],
      modified: true,
    });
    // Later edits of the Setup do not change what the solution was solved with.
    config.effectiveStack = 90;
    expect(store.solvedSpot?.modified).toBe(true);
  });

  test("without a spot, nothing is recorded", async () => {
    const store = useStore();
    store.solvedSpot = {
      name: "old",
      line: "",
      positions: ["BB", "BTN"],
      modified: false,
    };
    await useSolverSession().solve();
    expect(store.solvedSpot).toBeNull();
  });
});

describe("memory, checked before the open solution is replaced", () => {
  test("not enough memory: refused, the open solution stays", async () => {
    const store = withLoadedPartialSolution();
    store.isSolutionSaved = false;
    mocked.gameSolveEstimate.mockResolvedValue({
      need32: 10 * GB,
      need16: 9 * GB,
      bunching: 0,
      limit: 8 * GB,
    });
    const session = useSolverSession();

    await session.solve();

    expect(mocked.gameInit).not.toHaveBeenCalled();
    expect(session.message).toContain("Not enough memory");
    expect(store.isSolverFinished).toBe(true);
    expect(store.solutionInfo?.name).toBe("Jh 9d 4c");
  });

  test("a tree too large to build: refused with the reason, the open solution stays", async () => {
    const store = withLoadedPartialSolution();
    mocked.gameSolveEstimate.mockRejectedValue(
      "Not enough memory: this tree has 900.0 million nodes"
    );
    const session = useSolverSession();

    await session.solve();

    expect(mocked.gameInit).not.toHaveBeenCalled();
    expect(session.message).toContain("900.0 million nodes");
    expect(store.isSolverFinished).toBe(true);
    expect(store.isSolverError).toBe(false);
  });

  test("the limit comes from the engine (it counts what the open solution frees)", async () => {
    mocked.memory.mockResolvedValue([GB, 16 * GB]);
    mocked.gameSolveEstimate.mockResolvedValue({
      need32: 3 * GB,
      need16: 2 * GB,
      bunching: 0,
      limit: 4 * GB,
    });
    const session = useSolverSession();

    await session.solve();

    expect(mocked.gameSolveEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ startingPot: 20 }),
      false
    );
    expect(mocked.gameAllocateMemory).toHaveBeenCalledWith(false);
  });

  test("the bunching tables count when bunching is used", async () => {
    const store = useStore();
    store.isBunchingEnabled = true;
    store.bunchingFlop = [0, 5, 10];
    mocked.gameSolveEstimate.mockResolvedValue({
      need32: 3 * GB,
      need16: 2 * GB,
      bunching: 3 * GB,
      limit: 4 * GB,
    });
    const session = useSolverSession();

    await session.solve();

    expect(mocked.gameInit).not.toHaveBeenCalled();
    expect(session.message).toContain("Not enough memory");
  });

  test("with the limit lifted, a solve over it starts", async () => {
    mocked.gameSolveEstimate.mockResolvedValue({
      need32: 30 * GB,
      need16: 20 * GB,
      bunching: 0,
      limit: 2 ** 64,
    });
    const session = useSolverSession();
    session.ignoreMemoryLimit = true;

    await session.solve();

    expect(mocked.gameSolveEstimate).toHaveBeenCalledWith(
      expect.anything(),
      true
    );
    expect(mocked.gameAllocateMemory).toHaveBeenCalledWith(false);
  });

  test("a refused solve keeps the spot recorded with the open solution", async () => {
    const store = withLoadedPartialSolution();
    const spot = { line: "BTN 2.5 · BB call" };
    store.solvedSpot = spot as never;
    mocked.gameSolveEstimate.mockRejectedValue("Not enough memory");

    await useSolverSession().solve();

    expect(store.solvedSpot).toEqual(spot);
    expect(store.solutionInfo?.name).toBe("Jh 9d 4c");
  });
});
