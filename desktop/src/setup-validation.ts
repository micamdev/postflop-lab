// The setup checks, in one place: the Tree page lists them by section, Solve and the memory
// estimate stop at the first one.

import type { useConfigStore } from "./store";
import {
  BET_FIELDS,
  betFieldName,
  isDonkField,
  isRaiseField,
} from "./bet-fields";
import {
  MAX_AMOUNT,
  ROOT_LINE_STRING,
  INVALID_LINE_STRING,
  readableLineString,
  sanitizeBetString,
} from "./utils";
import { bbText } from "./units";

type Config = ReturnType<typeof useConfigStore>;

/** A cleared number field holds "" (or NaN): it must not reach the engine. */
const isNumber = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);

const lines = (s: string) =>
  s === "" ? [] : s.split(",").map(readableLineString);

/** Errors of the setup, by section of the Tree page. */
export const setupErrors = (config: Config) => {
  const basics: string[] = [];
  const amount = (value: unknown, name: string, max: number) => {
    if (!isNumber(value)) basics.push(`${name} must be a number`);
    else if (value <= 0) basics.push(`${name} must be positive`);
    else if (value > max)
      basics.push(`${name} must not exceed ${bbText(max)}bb`);
    // Stored in tenths of a big blind (whole numbers).
    else if (value % 1 !== 0)
      basics.push(`${name} must be a multiple of 0.1bb`);
  };
  amount(config.startingPot, "Starting pot", MAX_AMOUNT);
  amount(config.effectiveStack, "Effective stack", MAX_AMOUNT);
  if (!isNumber(config.rakePercent)) basics.push("Rake must be a number");
  else if (config.rakePercent < 0) basics.push("Rake must be non-negative");
  else if (config.rakePercent > 100) basics.push("Rake must not exceed 100%");
  if (!isNumber(config.rakeCap)) basics.push("Rake cap must be a number");
  else if (config.rakeCap < 0) basics.push("Rake cap must be non-negative");
  else if (config.rakeCap > 3 * MAX_AMOUNT) {
    basics.push(`Rake cap must not exceed ${bbText(3 * MAX_AMOUNT)}bb`);
  }

  // Each bet size field of a player, checked (donk sizes only with the donk option).
  const bets = (player: "oop" | "ip") =>
    BET_FIELDS.filter(
      (field) =>
        field.startsWith(player) && (!isDonkField(field) || config.donkOption)
    ).flatMap((field) => {
      const res = sanitizeBetString(config[field], isRaiseField(field));
      return res.valid ? [] : [`${betFieldName(field)}: ${res.s}`];
    });
  const oop = bets("oop");
  const ip = bets("ip");

  const misc: string[] = [];
  for (const [value, name] of [
    [config.addAllInThreshold, "Add all-in threshold"],
    [config.forceAllInThreshold, "Force all-in threshold"],
    [config.mergingThreshold, "Merging threshold"],
  ] as const) {
    if (!isNumber(value) || value < 0) {
      misc.push(`${name} must be a non-negative number`);
    }
  }

  const lineErrors: string[] = [];
  const added = lines(config.addedLines);
  const removed = lines(config.removedLines);
  if (
    [...added, ...removed].some(
      (line) => line === ROOT_LINE_STRING || line === INVALID_LINE_STRING
    )
  ) {
    lineErrors.push("Invalid line found (loaded broken configurations?)");
  }
  const edited = added.length > 0 || removed.length > 0;
  if (
    ![0, 3, 4, 5].includes(config.expectedBoardLength) ||
    (config.expectedBoardLength === 0 && edited) ||
    (config.expectedBoardLength > 0 && !edited)
  ) {
    lineErrors.push("Invalid configurations (loaded broken configurations?)");
  }

  return { basics, oop, ip, misc, lines: lineErrors };
};

/** Why the tree cannot be built from `config` (board included), or null. */
export const checkConfig = (config: Config): string | null => {
  if (config.board.length < 3) {
    return "Board must consist of at least three cards";
  }
  const errors = setupErrors(config);
  const first = Object.values(errors).flat()[0];
  if (first) return first;
  if (
    config.expectedBoardLength > 0 &&
    config.board.length !== config.expectedBoardLength
  ) {
    return `Invalid board (expected ${config.expectedBoardLength} cards)`;
  }
  return null;
};

/** Why Solve cannot start (the setup, or an empty range), or null. */
export const solveBlocker = (
  config: Config,
  ranges: number[][]
): string | null => {
  const configError = checkConfig(config);
  if (configError !== null) return configError;
  if (ranges[0].every((w) => w === 0)) return "The OOP range is empty.";
  if (ranges[1].every((w) => w === 0)) return "The IP range is empty.";
  return null;
};
