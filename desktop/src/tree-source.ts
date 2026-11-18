// The saved tree the setup came from, and whether the setup still matches it.

import { watch } from "vue";
import { useConfigStore, useStore } from "./store";
import { configToValue, type ConfigValue } from "./tree-config-value";

/** The setup now comes from the saved tree `path`, whose value is `value`. */
export const setTreeSource = (path: string[], value: ConfigValue) => {
  const store = useStore();
  store.treeSource = { path, modified: false };
  store.treeSourceValue = JSON.stringify(value);
};

/**
 * Keeps `treeSource.modified` in step with the setup: any edit (Setup panels or the Tree page)
 * marks it, and undoing the edit clears it. Call once, from a component that stays mounted.
 */
export const trackTreeModified = () => {
  const store = useStore();
  const config = useConfigStore();
  return watch(
    () => JSON.stringify(configToValue(config)),
    (value) => {
      if (store.treeSource && store.treeSourceValue !== null) {
        store.treeSource.modified = value !== store.treeSourceValue;
      }
    }
  );
};
