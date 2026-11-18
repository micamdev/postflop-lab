import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// The Tauri boundary: every game command the session calls.
vi.mock("./invokes", () => ({
  gameInit: vi.fn(),
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
import { useSolverSession } from "./solver-session";

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
    mocked.gameMemoryUsage.mockResolvedValue([10 * GB, 2 * GB]);
    const session = useSolverSession();

    await session.solve();

    expect(session.message).toContain("Bunching effect is on");
    expect(session.message).toContain("16-bit");
  });
});
