import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("./invokes", () => ({ gamePrepareLockSolve: vi.fn() }));
vi.mock("./library", () => ({ choose: vi.fn() }));
const runLockedSolve = vi.fn();
vi.mock("./solver-session", () => ({
  useSolverSession: () => ({ runLockedSolve, saveDisabledReason: "" }),
}));

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
