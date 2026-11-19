import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const session = { isBuilding: false };
vi.mock("./solver-session", () => ({ useSolverSession: () => session }));

import { useStore } from "./store";
import { solverBusyReason, useSolverBusy } from "./solver-busy";

beforeEach(() => {
  setActivePinia(createPinia());
  session.isBuilding = false;
});

describe("why the solver is busy", () => {
  test("free: no reason, not busy", () => {
    expect(solverBusyReason()).toBe("");
    expect(useSolverBusy().value).toBe(false);
  });

  test("each operation says what holds the solver", () => {
    const store = useStore();
    store.isBunchingRunning = true;
    expect(solverBusyReason()).toBe(
      "The bunching effect is being precomputed."
    );
    expect(useSolverBusy().value).toBe(true);
    store.isBunchingRunning = false;
    store.isSolveStarting = true;
    expect(solverBusyReason()).toBe("A solve is starting.");
    store.isSolveStarting = false;
    store.isSolverPaused = true;
    expect(solverBusyReason()).toBe("The solver is paused.");
  });

  test("the library's own operation can be left out (the lock re-solve holds it)", () => {
    const store = useStore();
    store.isLibraryBusy = true;
    expect(solverBusyReason()).toBe("The library is busy.");
    expect(solverBusyReason({ ignoreLibrary: true })).toBe("");
  });
});
