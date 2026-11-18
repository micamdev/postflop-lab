import { beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { tauriInvoke } = vi.hoisted(() => ({ tauriInvoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriInvoke }));

import { gameExploitability, setInternalErrorHandler } from "./invokes";
import { handleInternalError } from "./internal-error";
import { useStore } from "./store";

beforeEach(() => setActivePinia(createPinia()));

test("an internal error reaches the handler and is still rejected", async () => {
  const handler = vi.fn();
  setInternalErrorHandler(handler);
  tauriInvoke.mockRejectedValue("Internal error: index out of bounds.");
  await expect(gameExploitability()).rejects.toMatch(/^Internal error/);
  expect(handler).toHaveBeenCalledWith("Internal error: index out of bounds.");

  handler.mockClear();
  tauriInvoke.mockRejectedValue("This card cannot be dealt here");
  await expect(gameExploitability()).rejects.toBe(
    "This card cannot be dealt here"
  );
  expect(handler).not.toHaveBeenCalled();
});

test("when Rust reset the solution, the app drops it and says so", () => {
  const store = useStore();
  Object.assign(store, {
    isSolverFinished: true,
    isSolverRunning: true,
    isLibraryBusy: true,
    isSaveDialogOpen: true,
    solutionInfo: { name: "x", loaded: true, iterations: 1, exploitability: 0 },
  });
  const resets = store.treeResetCount;
  handleInternalError("Internal error (solution reset): boom at solver.rs:1.");
  expect(store.isSolverFinished).toBe(false);
  expect(store.isSolverRunning).toBe(false);
  expect(store.isLibraryBusy).toBe(false);
  expect(store.isSaveDialogOpen).toBe(false);
  expect(store.solutionInfo).toBeNull();
  expect(store.treeResetCount).toBe(resets + 1);
  expect(store.appError).toMatch(/solution reset/);
});

test("an internal error that did not touch the game keeps the solution", () => {
  const store = useStore();
  store.isSolverFinished = true;
  const resets = store.treeResetCount;
  handleInternalError("Internal error: bad library file.");
  expect(store.isSolverFinished).toBe(true);
  expect(store.treeResetCount).toBe(resets);
  expect(store.appError).toBe("Internal error: bad library file.");
});

test("cleared bunching data is forgotten", () => {
  const store = useStore();
  store.bunchingFlop = [1, 2, 3];
  store.isBunchingRunning = true;
  handleInternalError("Internal error (bunching data reset): boom.");
  expect(store.bunchingFlop).toEqual([]);
  expect(store.isBunchingRunning).toBe(false);
});
