import { describe, expect, test } from "vitest";
import {
  SETTINGS_KEY,
  BATCH_TARGETS,
  DEFAULT_BATCH_TARGET,
  defaultSolveSettings,
  loadSolveSettings,
  saveSolveSettings,
  validateSolveSettings,
} from "./solve-settings";

const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
};

describe("solve settings", () => {
  test("defaults", () => {
    expect(defaultSolveSettings(8)).toEqual({
      threads: 8,
      precision: "32",
      targetExploitability: 0.5,
      maxIterations: 1000,
    });
    expect(defaultSolveSettings(0).threads).toBe(1);
    expect(defaultSolveSettings(128).threads).toBe(64);
  });

  test("a batch aims at 1% of the pot by default (its report averages many flops)", () => {
    expect(DEFAULT_BATCH_TARGET).toBe(1);
    expect(BATCH_TARGETS).toEqual([0.5, 1, 2]);
  });

  test("validate", () => {
    const ok = defaultSolveSettings(8);
    expect(validateSolveSettings(ok)).toBeNull();
    for (const threads of [0, 65, 2.5]) {
      expect(validateSolveSettings({ ...ok, threads })).not.toBeNull();
    }
    for (const targetExploitability of [0, -1]) {
      expect(
        validateSolveSettings({ ...ok, targetExploitability })
      ).not.toBeNull();
    }
    for (const maxIterations of [-1, 1.5, 100001]) {
      expect(validateSolveSettings({ ...ok, maxIterations })).not.toBeNull();
    }
    expect(validateSolveSettings({ ...ok, threads: 1 })).toBeNull();
    expect(validateSolveSettings({ ...ok, threads: 64 })).toBeNull();
    expect(validateSolveSettings({ ...ok, maxIterations: 100000 })).toBeNull();
    expect(validateSolveSettings({ ...ok, maxIterations: 0 })).toBeNull();
  });

  test("round trip", () => {
    const storage = fakeStorage();
    const settings = {
      threads: 4,
      precision: "16" as const,
      targetExploitability: 0.5,
      maxIterations: 300,
    };
    saveSolveSettings(storage, settings);
    expect(loadSolveSettings(storage, 8)).toEqual(settings);
  });

  test("loadSolveSettings ignores invalid fields", () => {
    const stored = fakeStorage({
      [SETTINGS_KEY]: JSON.stringify({
        threads: 999,
        precision: "8",
        targetExploitability: 0.5,
      }),
    });
    expect(loadSolveSettings(stored, 8)).toEqual({
      threads: 8,
      precision: "32",
      targetExploitability: 0.5,
      maxIterations: 1000,
    });
    const broken = fakeStorage({ [SETTINGS_KEY]: "not json" });
    expect(loadSolveSettings(broken, 8)).toEqual(defaultSolveSettings(8));
    expect(loadSolveSettings(fakeStorage(), 8)).toEqual(
      defaultSolveSettings(8)
    );
  });
});
