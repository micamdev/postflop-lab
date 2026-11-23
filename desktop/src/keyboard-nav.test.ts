import { describe, expect, test } from "vitest";
import { treeKey, wrapTab } from "./keyboard-nav";

describe("explorer keys (a tree list)", () => {
  const at = (key: string, index = 1, isFolder = false, isOpen = false) =>
    treeKey(key, index, 4, isFolder, isOpen);

  test("arrows, Home and End move between rows, within the list", () => {
    expect(at("ArrowDown")).toEqual({ move: 2 });
    expect(at("ArrowUp")).toEqual({ move: 0 });
    expect(at("ArrowDown", 3)).toEqual({ move: 3 });
    expect(at("ArrowUp", 0)).toEqual({ move: 0 });
    expect(at("Home", 2)).toEqual({ move: 0 });
    expect(at("End", 0)).toEqual({ move: 3 });
  });

  test("right opens a closed folder, left closes an open one", () => {
    expect(at("ArrowRight", 1, true, false)).toEqual({ toggle: true });
    expect(at("ArrowRight", 1, true, true)).toBeNull();
    expect(at("ArrowLeft", 1, true, true)).toEqual({ toggle: true });
    expect(at("ArrowLeft", 1, true, false)).toBeNull();
    expect(at("ArrowRight")).toBeNull();
  });

  test("Enter and Space use the row", () => {
    expect(at("Enter")).toEqual({ activate: true });
    expect(at(" ")).toEqual({ activate: true });
    expect(at("a")).toBeNull();
  });
});

describe("Tab inside a modal dialog", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };

  test("Tab from the last goes to the first, Shift+Tab from the first to the last", () => {
    expect(wrapTab([a, b, c], c, false)).toBe(a);
    expect(wrapTab([a, b, c], a, true)).toBe(c);
  });

  test("inside the list, the browser moves on its own", () => {
    expect(wrapTab([a, b, c], b, false)).toBeNull();
    expect(wrapTab([a, b, c], b, true)).toBeNull();
  });

  test("focus outside the dialog comes back to it", () => {
    expect(wrapTab([a, b, c], { id: "x" }, false)).toBe(a);
    expect(wrapTab([a, b, c], null, true)).toBe(c);
    expect(wrapTab([], a, false)).toBeNull();
  });
});
