/* eslint-disable @typescript-eslint/no-explicit-any -- mocked IPC payloads */
import { expect, test, vi } from "vitest";

let gate: Promise<void> | null = null;
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) => {
    if (gate && cmd === "game_apply_history") await gate;
    switch (cmd) {
      case "game_apply_history":
        return null;
      case "game_get_results":
        return {
          current_player: "oop",
          num_actions: 2,
          is_empty: 0,
          eqr_base: [0, 0],
          weights: [[1], [1]],
          normalizer: [[1], [1]],
          equity: [[0.5], [0.5]],
          ev: [[1], [1]],
          eqr: [[1], [1]],
          strategy: [0.5, 0.5],
          action_ev: [0, 0],
        };
      case "game_actions_after":
        return ["Check:0", "Bet:30"];
      case "game_total_bet_amount":
        return [0, 0];
      default:
        return null;
    }
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));

import { h, ref, defineComponent } from "vue";
import { createPinia, setActivePinia } from "pinia";
import ResultNav from "../ResultNav.vue";
import { useSavedConfigStore } from "../../store";
import { findAll, click, flush, textOf, mountNav } from "./harness";

test("a navigation cut short by a load or a solve does not leave the navigation locked", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const cfg = useSavedConfigStore();
  cfg.board = [0, 5, 10];
  // Same as ResultViewer: isLocked lives in the parent, ResultNav is under v-if="isSolverFinished".
  const show = ref(true);
  const m = mountNav(
    defineComponent({
      inheritAttrs: false,
      setup(_, { attrs }) {
        return () => (show.value ? h(ResultNav as any, { ...attrs }) : null);
      },
    })
  );
  m.app.use(pinia);
  m.app.mount(m.root);
  m.isHandlerUpdated.value = true;
  await flush();
  const buttons = findAll(
    m.root,
    (n) => n.tag === "button" && /Check|Bet/.test(textOf(n))
  );
  let release!: () => void;
  gate = new Promise((r) => (release = r));
  click(buttons[0]);
  await flush();
  expect(m.isLocked.value).toBe(true);
  show.value = false; // solution replaced: isSolverFinished false
  await flush();
  gate = null;
  release();
  await flush();
  show.value = true; // new solution ready
  await flush();
  m.isHandlerUpdated.value = true;
  await flush(40);
  const after = findAll(
    m.root,
    (n) => n.tag === "button" && /Check|Bet/.test(textOf(n))
  );

  expect(m.isLocked.value).toBe(false);
  expect(after.length).toBe(2);
});
