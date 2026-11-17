import { describe, expect, test } from "vitest";
import type { NodeLock } from "./invokes";
import { hasPendingLocks, mirrorEdits } from "./lock-utils";

const lock = (key: number[], hands: Record<string, number[]>): NodeLock => ({
  history: key,
  key,
  player: "oop",
  actions: ["Check", "Bet 30"],
  hands,
  edited: Object.keys(hands),
  label: "",
});

describe("mirrorEdits", () => {
  // Cards: 4 * rank + suit (c d h s), rank 2 = 0 .. A = 12. Kc = 44, Ks = 47.
  const fromHistory = [0, 0, 44, 0];
  const toHistory = [0, 0, 47, 0];
  const edits = { AcQc: [1, 0], KhKc: [0, 1], AdKd: [0.5, 0.5] };

  test("swaps the turn suits in every combo", () => {
    expect(mirrorEdits(edits, fromHistory, toHistory)).toEqual({
      AsQs: [1, 0],
      KsKh: [0, 1], // re-ordered: higher card id first
      AdKd: [0.5, 0.5], // untouched suits
    });
  });

  test("the same line is unchanged", () => {
    expect(mirrorEdits(edits, fromHistory, fromHistory)).toEqual(edits);
  });
});

describe("hasPendingLocks", () => {
  const a = lock([0], { AsAh: [1, 0] });
  const b = lock([1], { KsKh: [0, 1] });

  test("the same locks in another order are not pending", () => {
    expect(hasPendingLocks([b, a], [a, b])).toBe(false);
    expect(hasPendingLocks([], [])).toBe(false);
  });

  test("an added lock is pending", () => {
    expect(hasPendingLocks([a, b], [a])).toBe(true);
  });

  test("hasPendingLocks when a lock was removed", () => {
    expect(hasPendingLocks([], [a])).toBe(true);
  });

  test("changed hands are pending", () => {
    expect(hasPendingLocks([lock([0], { AsAh: [0, 1] })], [a])).toBe(true);
  });
});
