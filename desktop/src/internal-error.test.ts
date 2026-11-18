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
  tauriInvoke.mockRejectedValue(
    "Internal error: index out of bounds. The solution …"
  );
  await expect(gameExploitability()).rejects.toMatch(/^Internal error/);
  expect(handler).toHaveBeenCalledWith(
    expect.stringMatching(/^Internal error/),
    "game_exploitability"
  );

  handler.mockClear();
  tauriInvoke.mockRejectedValue("This card cannot be dealt here");
  await expect(gameExploitability()).rejects.toBe(
    "This card cannot be dealt here"
  );
  expect(handler).not.toHaveBeenCalled();
});

test("after an internal error the app shows no results and the message", () => {
  const store = useStore();
  Object.assign(store, {
    isSolverFinished: true,
    isSolverRunning: true,
    isLibraryBusy: true,
    solutionInfo: { name: "x", loaded: true, iterations: 1, exploitability: 0 },
  });
  const resets = store.treeResetCount;
  handleInternalError("Internal error: boom.", "game_solve_step");
  expect(store.isSolverFinished).toBe(false);
  expect(store.isSolverRunning).toBe(false);
  expect(store.isLibraryBusy).toBe(false);
  expect(store.solutionInfo).toBeNull();
  expect(store.treeResetCount).toBe(resets + 1);
  expect(store.appError).toMatch(/^Internal error: boom. The solution/);
});

test("an internal error outside the game keeps the solution", () => {
  const store = useStore();
  store.isSolverFinished = true;
  const resets = store.treeResetCount;
  handleInternalError("Internal error: bad line.", "tree_apply_history");
  expect(store.isSolverFinished).toBe(true);
  expect(store.treeResetCount).toBe(resets);
  expect(store.appError).toBe("Internal error: bad line.");
});
