import { expect, test } from "vitest";
import {
  checkSpotValue,
  isSpotModified,
  readSpotRecord,
  spotRecord,
  toBigBlinds,
  type LoadedSpot,
  type SpotValue,
} from "./spot";

// Made-up ranges and numbers.
const value: SpotValue = {
  oopRange: "AA,KK",
  ipRange: "QQ",
  startingPot: 280,
  effectiveStack: 865,
  rakePercent: 5,
  rakeCap: 150,
  line: "BTN 2.5 · BB 13.5 · BTN call",
  positions: ["BB", "BTN"],
};
const setup = {
  startingPot: 280,
  effectiveStack: 865,
  rakePercent: 5,
  rakeCap: 150,
};
const spot = (rangesEdited = false): LoadedSpot => ({
  path: ["Pack", "3-bet pots", "BTN open, BB 3-bet, BTN call"],
  name: "BTN open, BB 3-bet, BTN call",
  value,
  rangesEdited,
});

test("a complete spot is valid", () => {
  expect(checkSpotValue(value)).toBeNull();
});

test("an incomplete or wrong spot is refused with a reason", () => {
  const noIp = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "ipRange")
  );
  for (const bad of [
    null,
    "AA",
    noIp,
    { ...value, ipRange: "" },
    { ...value, startingPot: 0 },
    { ...value, effectiveStack: -1 },
    { ...value, startingPot: "280" },
    { ...value, rakePercent: 101 },
    { ...value, rakeCap: -1 },
    { ...value, positions: ["BB"] },
    { ...value, line: 3 },
  ]) {
    expect(checkSpotValue(bad), JSON.stringify(bad)).toEqual(
      expect.any(String)
    );
  }
});

test("a spot is modified when its numbers differ, not once set back", () => {
  expect(isSpotModified(spot(), setup)).toBe(false);
  expect(isSpotModified(spot(), { ...setup, effectiveStack: 900 })).toBe(true);
  expect(isSpotModified(spot(), { ...setup })).toBe(false);
  expect(isSpotModified(spot(), { ...setup, rakeCap: 0 })).toBe(true);
});

test("an edited range keeps the spot modified", () => {
  expect(isSpotModified(spot(true), setup)).toBe(true);
});

test("the record a solution keeps", () => {
  expect(spotRecord(spot(), setup)).toEqual({
    name: "BTN open, BB 3-bet, BTN call",
    line: "BTN 2.5 · BB 13.5 · BTN call",
    positions: ["BB", "BTN"],
    modified: false,
  });
  expect(spotRecord(spot(), { ...setup, startingPot: 55 }).modified).toBe(true);
});

test("amounts in big blinds", () => {
  expect(toBigBlinds(280)).toBe("28bb");
  expect(toBigBlinds(865)).toBe("86.5bb");
  expect(toBigBlinds(55)).toBe("5.5bb");
});

test("a solution's spot is read back only when well formed", () => {
  expect(readSpotRecord(undefined)).toBeNull();
  expect(readSpotRecord(null)).toBeNull();
  expect(readSpotRecord({ name: 1 })).toBeNull();
  const record = spotRecord(spot(), setup);
  expect(readSpotRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
});
