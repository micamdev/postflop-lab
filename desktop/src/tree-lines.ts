// Lines of the tree editor: an action's code in a line ("B30") and a list of lines ("X-B30,
// X-X") as readable strings.

import { readableLineString } from "./utils";

const CODES: Record<string, string> = {
  Fold: "F",
  Check: "X",
  Call: "C",
  Bet: "B",
  Raise: "R",
  Allin: "A",
};

/** "B30" for a bet of 30, "X" for a check: amounts only where they say something. */
export const actionCode = (name: string, amount: string) =>
  CODES[name] + (["Bet", "Raise", "Allin"].includes(name) ? amount : "");

/** A comma-separated list of lines as readable strings; none for "". */
export const readableLines = (lines: string) =>
  lines === "" ? [] : lines.split(",").map(readableLineString);
