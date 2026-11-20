import { beforeEach, expect, test, vi } from "vitest";
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
vi.mock("./library", () => ({ ask: vi.fn() }));

import * as invokes from "./invokes";
import * as library from "./library";
import { useConfigStore, useStore } from "./store";
import { configToValue } from "./tree-config-value";
import { loadSpot, loadTreeWithSpot } from "./spot-load";
import type { SpotValue } from "./spot";

const mocked = vi.mocked(invokes);
const ask = vi.mocked(library.ask);

// Made-up ranges and numbers.
const value: SpotValue = {
  oopRange: "AA,KK",
  ipRange: "QQ",
  startingPot: 275,
  effectiveStack: 865,
  rakePercent: 5,
  rakeCap: 150,
  line: "BTN 2.5 · BB 13.5 · BTN call",
  positions: ["BB", "BTN"],
};
const path = ["Pack", "3-bet pots", "BTN open, BB 3-bet, BTN call"];

let engine: string[];
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  engine = ["JJ", "TT"];
  mocked.rangeFromString.mockImplementation(async (player, text) => {
    engine[player] = text;
    return null;
  });
  mocked.rangeToString.mockImplementation(async (player) => engine[player]);
  mocked.rangeGetWeights.mockResolvedValue(Array(169).fill(0));
  mocked.rangeNumCombos.mockResolvedValue(6);
});

test("a spot sets both ranges, the pot, the stack and the rake", async () => {
  const store = useStore();
  const config = useConfigStore();
  store.rangeSources = [{ path: ["R"], modified: false }, null];

  expect(await loadSpot(path, value)).toBeNull();

  expect(engine).toEqual(["AA,KK", "QQ"]);
  expect(config.startingPot).toBe(275);
  expect(config.effectiveStack).toBe(865);
  expect(config.rakePercent).toBe(5);
  expect(config.rakeCap).toBe(150);
  expect(store.spot).toEqual({
    path,
    name: "BTN open, BB 3-bet, BTN call",
    value,
    rangesEdited: false,
  });
  expect(store.rangeSources).toEqual([null, null]);
});

test("a spot with an unreadable range changes nothing", async () => {
  const store = useStore();
  const config = useConfigStore();
  const before = configToValue(config);

  const error = await loadSpot(path, { ...value, ipRange: "AA,ZZ" });

  expect(error).toMatch(/^IP range: /);
  expect(engine).toEqual(["JJ", "TT"]);
  expect(configToValue(config)).toEqual(before);
  expect(store.spot).toBeNull();
});

test("if the engine refuses the IP range, the OOP range is put back", async () => {
  mocked.rangeFromString.mockImplementation(async (player, text) => {
    if (player === 1) return "refused";
    engine[player] = text;
    return null;
  });
  expect(await loadSpot(path, value)).toMatch(/^IP range: /);
  expect(engine[0]).toBe("JJ");
  expect(useStore().spot).toBeNull();
});

test("a tree with edited lines: Cancel keeps everything", async () => {
  const config = useConfigStore();
  config.addedLines = "R40";
  ask.mockResolvedValue(false);

  expect(await loadSpot(path, value)).toBeNull();

  expect(ask).toHaveBeenCalledOnce();
  expect(config.addedLines).toBe("R40");
  expect(config.startingPot).toBe(55);
  expect(useStore().spot).toBeNull();
});

test("a tree with edited lines: Continue removes them and loads", async () => {
  const config = useConfigStore();
  config.removedLines = "C";
  ask.mockResolvedValue(true);

  expect(await loadSpot(path, value)).toBeNull();

  expect(config.removedLines).toBe("");
  expect(config.startingPot).toBe(275);
  expect(useStore().spot?.name).toBe("BTN open, BB 3-bet, BTN call");
});

test("a tree loaded over a spot keeps the spot's pot and stack", async () => {
  const store = useStore();
  const config = useConfigStore();
  await loadSpot(path, value);
  const tree = {
    ...configToValue(config),
    startingPot: 55,
    effectiveStack: 975,
    oopFlopBet: "50",
  };

  expect(await loadTreeWithSpot(["T"], tree)).toBe(true);

  expect(config.startingPot).toBe(275);
  expect(config.effectiveStack).toBe(865);
  expect(config.oopFlopBet).toBe("50");
  expect(store.treeSource).toEqual({ path: ["T"], modified: false });
});

test("a tree with edited lines over a spot asks first", async () => {
  const config = useConfigStore();
  await loadSpot(path, value);
  const tree = {
    ...configToValue(config),
    startingPot: 55,
    addedLines: "R40",
    oopFlopBet: "50",
  };
  ask.mockResolvedValue(false);

  expect(await loadTreeWithSpot(["T"], tree)).toBe(false);
  expect(config.oopFlopBet).not.toBe("50");

  ask.mockResolvedValue(true);
  expect(await loadTreeWithSpot(["T"], tree)).toBe(true);
  expect(config.oopFlopBet).toBe("50");
  expect(config.addedLines).toBe("");
  expect(config.startingPot).toBe(275);
});
