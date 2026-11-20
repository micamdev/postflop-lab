// The saved tree the setup came from, and whether the setup still matches it.

import { watch } from "vue";
import { useConfigStore, useStore } from "./store";
import { configToValue, type ConfigValue } from "./tree-config-value";
import { SPOT_FIELDS } from "./spot";

/** The setup now comes from the saved tree `path`, whose value is `value`. */
export const setTreeSource = (path: string[], value: ConfigValue) => {
  const store = useStore();
  store.treeSource = { path, modified: false };
  store.treeSourceValue = JSON.stringify(value);
};

/**
 * What a tree is compared on: everything, or (a spot being loaded, which owns them) all but
 * the pot, the stack and the rake.
 */
export const treeValueKey = (
  value: ConfigValue,
  ignoreSpotFields: boolean
): string => {
  if (!ignoreSpotFields) return JSON.stringify(value);
  const rest: Partial<ConfigValue> = { ...value };
  for (const field of SPOT_FIELDS) delete rest[field];
  return JSON.stringify(rest);
};

/**
 * Keeps `treeSource.modified` in step with the setup: any edit (Setup panels or the Tree page)
 * marks it, and undoing the edit clears it. Call once, from a component that stays mounted.
 */
export const trackTreeModified = () => {
  const store = useStore();
  const config = useConfigStore();
  return watch(
    () => [JSON.stringify(configToValue(config)), store.spot !== null] as const,
    ([value, withSpot]) => {
      if (store.treeSource && store.treeSourceValue !== null) {
        store.treeSource.modified =
          treeValueKey(JSON.parse(value) as ConfigValue, withSpot) !==
          treeValueKey(
            JSON.parse(store.treeSourceValue) as ConfigValue,
            withSpot
          );
      }
    }
  );
};
