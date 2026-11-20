import { beforeEach, expect, test } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useConfigStore, useStore } from "./store";
import { configToValue } from "./tree-config-value";
import { setTreeSource, trackTreeModified, treeValueKey } from "./tree-source";

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

test("with a spot, the tree's key ignores pot, stack and rake", () => {
  const a = configToValue(useConfigStore());
  const b = {
    ...a,
    startingPot: 280,
    effectiveStack: 865,
    rakePercent: 5,
    rakeCap: 150,
  };
  expect(treeValueKey(a, true)).toBe(treeValueKey(b, true));
  expect(treeValueKey(a, false)).not.toBe(treeValueKey(b, false));
  expect(treeValueKey(a, true)).not.toBe(
    treeValueKey({ ...a, oopFlopBet: "50" }, true)
  );
});

test("a spot's pot and stack do not mark the tree modified", async () => {
  const store = useStore();
  const config = useConfigStore();
  trackTreeModified();
  setTreeSource(["X"], configToValue(config));
  store.spot = {
    path: ["S"],
    name: "S",
    value: {
      oopRange: "AA",
      ipRange: "KK",
      startingPot: 280,
      effectiveStack: 865,
      rakePercent: 5,
      rakeCap: 150,
      line: "",
      positions: ["BB", "BTN"],
    },
    rangesEdited: false,
  };
  config.startingPot = 280;
  config.effectiveStack = 865;
  await nextTick();
  expect(store.treeSource?.modified).toBe(false);
  config.oopFlopBet = "50";
  await nextTick();
  expect(store.treeSource?.modified).toBe(true);
});
