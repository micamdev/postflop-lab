import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("./invokes", () => ({ gamePrepareLockSolve: vi.fn() }));
vi.mock("./library", () => ({ choose: vi.fn() }));
const runLockedSolve = vi.fn();
const session = {
  runLockedSolve,
  saveDisabledReason: "",
  settings: {
    threads: 8,
    precision: "32",
    targetExploitability: 0.3,
    maxIterations: 1000,
  },
};
vi.mock("./solver-session", () => ({ useSolverSession: () => session }));

import * as invokes from "./invokes";
import * as library from "./library";
import type { NodeLock } from "./invokes";
import { useStore } from "./store";
import { useLockResolve } from "./lock-resolve";

const prepare = vi.mocked(invokes.gamePrepareLockSolve);
const choose = vi.mocked(library.choose);
const line = { history: [0, 1], label: "OOP Check, IP Bet 30" };
const lock: NodeLock = {
  history: [0],
  key: [0],
  player: "ip",
  actions: ["Check", "Bet 30"],
  hands: { AsAh: [1, 0] },
  edited: ["AsAh"],
  label: "",
};

/** A finished solution with one lock waiting to be applied. */
const finished = (saved: boolean) => {
  const store = useStore();
  store.isSolverFinished = true;
  store.isSolutionSaved = saved;
  store.locks = [lock];
  return store;
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  session.settings.threads = 8;
  prepare.mockResolvedValue(true);
});

describe("useLockResolve", () => {
  test("a saved solution is prepared with the locks and re-solved", async () => {
    const store = finished(true);
    await useLockResolve().start(line);

    expect(choose).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledWith([lock]);
    expect(runLockedSolve).toHaveBeenCalledWith(true);
    expect(store.returnLine).toEqual([0, 1]);
    expect(store.solutionLocks).toEqual([lock]);
    expect(store.isSolverFinished).toBe(false);
  });

  test("cancel keeps the solution", async () => {
    const store = finished(false);
    choose.mockResolvedValue("Cancel");
    await useLockResolve().start(line);

    expect(prepare).not.toHaveBeenCalled();
    expect(store.isSolverFinished).toBe(true);
    expect(store.isSaveDialogOpen).toBe(false);
  });

  test("save first: re-solves only once the solution is saved", async () => {
    const store = finished(false);
    choose.mockResolvedValue("Save first");
    const resolve = useLockResolve();
    await resolve.start(line);
    expect(store.isSaveDialogOpen).toBe(true);
    expect(prepare).not.toHaveBeenCalled();

    // Dialog cancelled: nothing happens.
    store.isSaveDialogOpen = false;
    await resolve.onSaveDialogClosed();
    expect(prepare).not.toHaveBeenCalled();

    // Saved this time.
    await resolve.start(line);
    store.isSolutionSaved = true;
    store.isSaveDialogOpen = false;
    await resolve.onSaveDialogClosed();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(store.returnLine).toEqual([0, 1]);
  });

  test("a prepare error keeps the solution and shows the reason", async () => {
    const store = finished(true);
    prepare.mockRejectedValue("Not enough memory");
    const resolve = useLockResolve();
    await resolve.start(line);

    expect(resolve.error).toBe("Not enough memory");
    expect(store.isSolverFinished).toBe(true);
    expect(store.isLibraryBusy).toBe(false);
    expect(runLockedSolve).not.toHaveBeenCalled();
  });
});

describe("useLockResolve guards", () => {
  test("results are blocked while the tree is prepared", async () => {
    finished(true);
    let release!: (value: boolean) => void;
    prepare.mockReturnValue(new Promise((r) => (release = r)));
    const resolve = useLockResolve();

    const started = resolve.start(line);
    await Promise.resolve();
    expect(resolve.isBusy).toBe(true);

    release(false);
    await started;
    expect(resolve.isBusy).toBe(false);
  });

  test("invalid solve settings refuse before touching the solution", async () => {
    const store = finished(false);
    session.settings.threads = 0;
    const resolve = useLockResolve();

    expect(resolve.disabledReason).toContain("Solve settings");
    await resolve.start(line);

    expect(choose).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(store.isSolverFinished).toBe(true);
  });

  test("bunching and a starting solve refuse too", () => {
    const store = finished(true);
    store.isBunchingEnabled = true;
    store.bunchingFlop = [0, 1, 2];
    expect(useLockResolve().disabledReason).toContain("bunching");
    store.isBunchingEnabled = false;
    store.isSolveStarting = true;
    expect(useLockResolve().disabledReason).toContain("starting");
  });

  test("an old error does not come back after a normal save", async () => {
    finished(true);
    prepare.mockRejectedValue("Not enough memory");
    const resolve = useLockResolve();
    await resolve.start(line);
    expect(resolve.error).toBe("Not enough memory");

    // A save unrelated to a re-solve.
    expect(await resolve.onSaveDialogClosed()).toBe(false);
    expect(resolve.error).toBe("");
  });
});

describe("a lock being captured", () => {
  test("refuses the re-solve until the capture is stored", async () => {
    finished(true);
    const resolve = useLockResolve();
    resolve.isCapturing = true;
    expect(resolve.disabledReason).not.toBe("");
    await resolve.start(line);
    expect(prepare).not.toHaveBeenCalled();
  });
});
