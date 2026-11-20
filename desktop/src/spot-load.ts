// Loading a spot (both ranges, pot, stack, rake) into the Setup, and a saved tree over it.

import { ask } from "./library";
import { parseRangeText } from "./range-text";
import { SPOT_FIELDS, toBigBlinds, type SpotValue } from "./spot";
import { useConfigStore, useStore } from "./store";
import {
  applyConfigValue,
  configToValue,
  hasManualEdits,
  type ConfigValue,
} from "./tree-config-value";
import { leaveTreeEdit } from "./tree-edit-guard";
import { setTreeSource } from "./tree-source";
import { useRangeEditing } from "./use-range-editing";
import * as invokes from "./invokes";

/**
 * A tree's lines edited by hand hold amounts made for its own pot and stack: asks before
 * they are removed. True to go on.
 */
const confirmLinesRemoved = (pot: number, stack: number) =>
  ask(
    `This tree's edited lines were made for pot ${toBigBlinds(pot)} and stack ` +
      `${toBigBlinds(stack)}; they will be removed.`
  );

/**
 * Loads the spot at `path`. Null when loaded or when the user cancelled (nothing changed);
 * otherwise the message to show (nothing changed either).
 */
export const loadSpot = async (
  path: string[],
  value: SpotValue
): Promise<string | null> => {
  const store = useStore();
  const config = useConfigStore();
  // The spot changes the pot and the stack: an open tree lines edit ends first.
  if (!(await leaveTreeEdit(undefined, "load"))) return null;

  const texts: [string, string] = [value.oopRange, value.ipRange];
  for (const player of [0, 1] as const) {
    const parsed = parseRangeText(texts[player]);
    if (!parsed.ok)
      return `${player === 0 ? "OOP" : "IP"} range: ${parsed.error}`;
  }

  const potOrStackChange =
    config.startingPot !== value.startingPot ||
    config.effectiveStack !== value.effectiveStack;
  if (hasManualEdits(config) && potOrStackChange) {
    if (
      !(await confirmLinesRemoved(config.startingPot, config.effectiveStack))
    ) {
      return null;
    }
  }

  // OOP then IP; if IP is refused, OOP goes back to what it was.
  const previousOop = await invokes.rangeToString(0);
  const previousSource = store.rangeSources[0];
  const oop = useRangeEditing(0);
  if (!(await oop.loadText(texts[0]))) return `OOP range: ${oop.error.value}`;
  const ip = useRangeEditing(1);
  if (!(await ip.loadText(texts[1]))) {
    const error = `IP range: ${ip.error.value}`;
    await oop.loadText(previousOop);
    store.rangeSources[0] = previousSource;
    return error;
  }

  if (hasManualEdits(config) && potOrStackChange) {
    config.addedLines = "";
    config.removedLines = "";
  }
  for (const field of SPOT_FIELDS) config[field] = value[field];
  store.spot = {
    path,
    name: path[path.length - 1],
    value,
    rangesEdited: false,
  };
  store.rangeSources = [null, null];
  return null;
};

/**
 * Loads a saved tree while a spot is loaded: its bet sizes and settings, not its pot, stack
 * or rake. False if the user stayed or cancelled (nothing changed).
 */
export const loadTreeWithSpot = async (
  path: string[],
  value: unknown
): Promise<boolean> => {
  const config = useConfigStore();
  if (!(await leaveTreeEdit(undefined, "load"))) return false;
  const tree = value as ConfigValue;
  const removeLines =
    hasManualEdits(tree) &&
    (Number(tree.startingPot) !== config.startingPot ||
      Number(tree.effectiveStack) !== config.effectiveStack);
  if (
    removeLines &&
    !(await confirmLinesRemoved(
      Number(tree.startingPot),
      Number(tree.effectiveStack)
    ))
  ) {
    return false;
  }
  applyConfigValue(config, value, SPOT_FIELDS);
  if (removeLines) {
    config.addedLines = "";
    config.removedLines = "";
  }
  setTreeSource(path, configToValue(config));
  return true;
};
