import { beforeEach, expect, test } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useConfigStore, useStore } from "./store";
import { configToValue } from "./tree-config-value";
import { setTreeSource, trackTreeModified } from "./tree-source";

beforeEach(() => setActivePinia(createPinia()));

test("any tree edit marks the saved tree modified, undoing it clears the mark", async () => {
  const store = useStore();
  const config = useConfigStore();
  trackTreeModified();
  setTreeSource(["X"], configToValue(config));
  expect(store.treeSource?.modified).toBe(false);

  config.rakeCap = 5; // edited on the Tree page
  await nextTick();
  expect(store.treeSource?.modified).toBe(true);

  config.rakeCap = 0;
  await nextTick();
  expect(store.treeSource?.modified).toBe(false);
});
