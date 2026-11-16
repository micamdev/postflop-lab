import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("./invokes", () => ({
  rangeUpdate: vi.fn(),
  rangeFromString: vi.fn(),
  rangeGetWeights: vi.fn(),
  rangeToString: vi.fn(),
  rangeNumCombos: vi.fn(),
  rangeClear: vi.fn(),
  rangeInvert: vi.fn(),
}));

import * as invokes from "./invokes";
import { useStore } from "./store";
import { useRangeEditing } from "./use-range-editing";

const mocked = vi.mocked(invokes);
const weights = Array.from({ length: 169 }, (_, i) => (i === 0 ? 1 : 0));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  mocked.rangeFromString.mockResolvedValue(null);
  mocked.rangeGetWeights.mockResolvedValue(weights);
  mocked.rangeToString.mockResolvedValue("AA");
  mocked.rangeNumCombos.mockResolvedValue(6);
});

describe("useRangeEditing", () => {
  test("a range loaded from the explorer remembers where it comes from", async () => {
    const store = useStore();
    const editing = useRangeEditing(0);

    expect(await editing.loadText("AA", ["100bb", "BB vs BTN call"])).toBe(
      true
    );

    expect(store.rangeSources[0]).toEqual({
      path: ["100bb", "BB vs BTN call"],
      modified: false,
    });
    expect(store.ranges[0][0]).toBe(100);
    expect(editing.numCombos.value).toBe(6);
  });

  test("an edit marks the range as modified", async () => {
    const store = useStore();
    const editing = useRangeEditing(1);
    await editing.loadText("AA", ["BTN open"]);

    await editing.setCell(1, 1, 50);

    expect(store.rangeSources[1]).toEqual({
      path: ["BTN open"],
      modified: true,
    });
  });

  test("an unreadable range keeps the previous origin", async () => {
    const store = useStore();
    const editing = useRangeEditing(0);
    await editing.loadText("AA", ["BTN open"]);

    expect(await editing.loadText("ZZ", ["Other"])).toBe(false);

    expect(editing.error.value).toBe("Failed to parse range: ZZ");
    expect(store.rangeSources[0]?.path).toEqual(["BTN open"]);
  });

  test("bunching fold ranges have no origin", async () => {
    const store = useStore();
    await useRangeEditing(2).loadText("AA", ["Fold range"]);
    expect(store.rangeSources).toEqual([null, null]);
  });
});

describe("shared editing state", () => {
  test("the explorer and the range panel edit the same range state", async () => {
    const fromExplorer = useRangeEditing(0);
    const fromPanel = useRangeEditing(0);
    await fromExplorer.loadText("AA", ["BTN open"]);
    expect(fromPanel.text.value).toBe("AA");
    expect(fromPanel.numCombos.value).toBe(6);
    expect(useRangeEditing(1)).not.toBe(fromPanel);
  });
});
