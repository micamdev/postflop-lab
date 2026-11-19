import { describe, expect, test } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createPinia, setActivePinia } from "pinia";
import ResultBasics from "./ResultBasics.vue";

// One OOP hand (AsAh) with 0 equity and 0 EV: river air that folds.
const pair = (a: number, b: number) => a | (b << 8);
const results = {
  currentPlayer: "ip" as const,
  numActions: 2,
  isEmpty: 0,
  eqrBase: [10, 10],
  weights: [[1], [1]],
  normalizer: [[1], [1]],
  equity: [[0], [1]],
  ev: [[0], [10]],
  eqr: [[Number.NaN], [1]],
  strategy: [0.5, 0.5],
  actionEv: [1, 2],
};

const render = (contentBasics: string, strategy: string) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createSSRApp({
    render: () =>
      h(ResultBasics as never, {
        cards: [[pair(50, 51)], [pair(0, 1)]],
        selectedSpot: {
          type: "player",
          player: "ip",
          index: 1,
          selectedIndex: -1,
          actions: [],
        },
        selectedChance: null,
        currentBoard: [4, 8, 12, 16, 20],
        results,
        totalBetAmount: [0, 0],
        displayOptions: {
          playerBasics: "oop",
          playerChance: "auto",
          barHeight: "normalized",
          suit: "grouped",
          strategy,
          contentBasics,
          contentGraphs: "eq",
          chartChance: "eq",
        },
        displayPlayer: "oop",
        isCompareMode: false,
      }),
  });
  app.use(pinia);
  return renderToString(app);
};

describe("ResultBasics grid in EQR mode", () => {
  test("a hand without equity renders, with a dash", async () => {
    const html = await render("eqr", "none");
    expect(html).not.toContain("∞");
    expect(html).toContain(">-<");
  });
});
