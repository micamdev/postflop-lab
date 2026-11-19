import { describe, expect, test } from "vitest";
import {
  SolveFlags,
  choosePrecision,
  memoryNeeds,
  primaryAction,
  savesBeside,
  progressFraction,
  solutionStatus,
} from "./solve-status";

const GB = 1024 * 1024 * 1024;

const flags = (f: Partial<SolveFlags>): SolveFlags => ({
  hasGame: true,
  isSolverRunning: false,
  isSolverPaused: false,
  isFinalizing: false,
  isSolverFinished: false,
  isSolverError: false,
  isSolutionSaved: false,
  ...f,
});

describe("solutionStatus", () => {
  test("labels and tones", () => {
    expect(solutionStatus(flags({ hasGame: false }))).toEqual({
      label: "Not solved",
      tone: "neutral",
    });
    expect(solutionStatus(flags({ isSolverRunning: true }))).toEqual({
      label: "Solving…",
      tone: "busy",
    });
    expect(solutionStatus(flags({ isSolverPaused: true }))).toEqual({
      label: "Paused",
      tone: "warn",
    });
    expect(solutionStatus(flags({ isFinalizing: true }))).toEqual({
      label: "Finalizing…",
      tone: "busy",
    });
    expect(solutionStatus(flags({ isSolverError: true }))).toEqual({
      label: "Error",
      tone: "error",
    });
    expect(solutionStatus(flags({ isSolverFinished: true }))).toEqual({
      label: "Not saved",
      tone: "warn",
    });
    expect(
      solutionStatus(flags({ isSolverFinished: true, isSolutionSaved: true }))
    ).toEqual({ label: "Saved", tone: "ok" });
  });
});

describe("primaryAction", () => {
  test("progress while the solver works", () => {
    expect(primaryAction(flags({ isSolverRunning: true }), true)).toBe(
      "progress"
    );
    expect(primaryAction(flags({ isSolverPaused: true }), true)).toBe(
      "progress"
    );
    expect(primaryAction(flags({ isFinalizing: true }), true)).toBe("progress");
  });

  test("save after an unsaved solve, nothing otherwise (Solve is in the Setup)", () => {
    expect(primaryAction(flags({ isSolverFinished: true }), true)).toBe("save");
    expect(
      primaryAction(
        flags({ isSolverFinished: true, isSolutionSaved: true }),
        true
      )
    ).toBe("none");
    expect(primaryAction(flags({ hasGame: false }), true)).toBe("none");
  });

  test("primaryAction never offers an impossible save", () => {
    expect(primaryAction(flags({ isSolverFinished: true }), false)).toBe(
      "none"
    );
  });
});

describe("progressFraction", () => {
  const base = {
    iteration: 0,
    maxIterations: 1000,
    initialExploitability: 100,
    exploitability: 100,
    target: 1,
  };

  test("iterations", () => {
    expect(progressFraction({ ...base, iteration: 500 })).toBeCloseTo(0.5);
  });

  test("exploitability on a log scale", () => {
    expect(progressFraction({ ...base, exploitability: 10 })).toBeCloseTo(0.5);
  });

  test("clamped", () => {
    expect(progressFraction({ ...base, exploitability: 0.5 })).toBe(1);
    expect(progressFraction({ ...base, exploitability: Infinity })).toBe(0);
    expect(progressFraction({ ...base, initialExploitability: NaN })).toBe(0);
  });
});

describe("memoryNeeds", () => {
  test("the bunching effect adds its tables when it is used", () => {
    expect(memoryNeeds([4, 2, 1], true)).toEqual({ need32: 5, need16: 3 });
    expect(memoryNeeds([4, 2, 1], false)).toEqual({ need32: 4, need16: 2 });
  });
});

describe("choosePrecision", () => {
  test("preferred precision fits", () => {
    expect(choosePrecision("32", 4 * GB, 2 * GB, 8 * GB, false)).toEqual({
      ok: true,
      compression: false,
      fellBack: false,
    });
    expect(choosePrecision("16", 4 * GB, 2 * GB, 8 * GB, false)).toEqual({
      ok: true,
      compression: true,
      fellBack: false,
    });
  });

  test("falls back to 16-bit", () => {
    expect(choosePrecision("32", 10 * GB, 5 * GB, 8 * GB, false)).toEqual({
      ok: true,
      compression: true,
      fellBack: true,
    });
  });

  test("refuses with both amounts", () => {
    const choice = choosePrecision("32", 24.6 * GB, 12.3 * GB, 8.1 * GB, false);
    expect(choice).toEqual({
      ok: false,
      message: "Needs 12.30 GB, 8.10 GB available",
    });
  });

  test("ignoring the limit keeps the preferred precision", () => {
    expect(choosePrecision("32", 24 * GB, 12 * GB, 8 * GB, true)).toEqual({
      ok: true,
      compression: false,
      fellBack: false,
    });
  });
});

describe("primaryAction with pending locks", () => {
  test("re-solve with locks on a finished solution, saved or not", () => {
    expect(
      primaryAction(
        flags({ isSolverFinished: true, isSolutionSaved: true }),
        true,
        true
      )
    ).toBe("resolve-locks");
    expect(primaryAction(flags({ isSolverFinished: true }), true, true)).toBe(
      "resolve-locks"
    );
  });

  test("never while solving", () => {
    expect(primaryAction(flags({ isSolverRunning: true }), true, true)).toBe(
      "progress"
    );
  });
});

describe("savesBeside", () => {
  test("Save stays reachable next to Re-solve with locks", () => {
    expect(savesBeside(flags({ isSolverFinished: true }), true)).toBe(true);
    expect(
      savesBeside(
        flags({ isSolverFinished: true, isSolutionSaved: true }),
        true
      )
    ).toBe(false);
    expect(savesBeside(flags({ isSolverFinished: true }), false)).toBe(false);
  });
});
