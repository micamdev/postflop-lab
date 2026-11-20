import { expect, test } from "vitest";
import {
  EXPLORER_WIDTH,
  clampExplorerWidth,
  loadExplorerWidth,
  saveExplorerWidth,
} from "./explorer-width";

const storage = (value: string | null) => {
  const items = new Map<string, string>();
  if (value !== null) items.set("postflop-lab.explorer-width", value);
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    items,
  };
};

test("the width stays between the minimum and the maximum", () => {
  expect(clampExplorerWidth(100, 1920)).toBe(EXPLORER_WIDTH.min);
  expect(clampExplorerWidth(400, 1920)).toBe(400);
  expect(clampExplorerWidth(5000, 1920)).toBe(EXPLORER_WIDTH.max);
});

test("a small window caps the width so the page keeps most of its room", () => {
  // At most 40% of the window, never under the minimum.
  expect(clampExplorerWidth(560, 1000)).toBe(400);
  expect(clampExplorerWidth(560, 400)).toBe(EXPLORER_WIDTH.min);
});

test("widths are whole pixels", () => {
  expect(clampExplorerWidth(301.6, 1920)).toBe(302);
});

test("no saved width, or a broken one: the default", () => {
  expect(loadExplorerWidth(storage(null))).toBe(EXPLORER_WIDTH.default);
  expect(loadExplorerWidth(storage("wide"))).toBe(EXPLORER_WIDTH.default);
  expect(loadExplorerWidth(storage(""))).toBe(EXPLORER_WIDTH.default);
});

test("a saved width comes back, kept within the limits", () => {
  expect(loadExplorerWidth(storage("380"))).toBe(380);
  expect(loadExplorerWidth(storage("9000"))).toBe(EXPLORER_WIDTH.max);
});

test("saving keeps the width for the next session", () => {
  const s = storage(null);
  saveExplorerWidth(s, 420);
  expect(loadExplorerWidth(s)).toBe(420);
});
