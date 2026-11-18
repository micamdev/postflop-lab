/* eslint-disable @typescript-eslint/no-explicit-any -- mocked IPC payloads */
import { expect, test, vi } from "vitest";

let current: number[] = [];
const board = [0, 5, 10];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: any) => {
    switch (cmd) {
      case "game_apply_history":
        current = args.history;
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
      case "game_actions_after": {
        const len = current.length + args.append.length;
        return len % 3 === 2 && len < 8 ? ["chance"] : ["Check:0", "Bet:30"];
      }
      case "game_total_bet_amount":
        return [0, 0];
      case "game_possible_cards": {
        let m = (1n << 52n) - 1n;
        for (const c of [
          ...board,
          ...current.filter((x) => x >= 0 && x < 52 && current.length > 2),
        ])
          m &= ~(1n << BigInt(c));
        return m.toString();
      }
      case "game_get_chance_reports":
        return {
          status: Array(52).fill(2),
          combos: [[], []],
          equity: [[], []],
          ev: [[], []],
          eqr: [[], []],
          strategy: [],
        };
      default:
        return null;
    }
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));

import { createPinia, setActivePinia } from "pinia";
import ResultNav from "../ResultNav.vue";
import { useSavedConfigStore } from "../../store";
import { mountNav, findAll, click, flush, textOf, N } from "./harness";

const spotDivs = (root: N) =>
  findAll(
    root,
    (n) =>
      n.tag === "div" &&
      typeof n.props.class === "string" &&
      n.props.class.includes("min-w-[7.5rem]")
  );
const actionBtn = (spot: N, name: string) =>
  findAll(spot, (n) => n.tag === "button" && textOf(n).includes(name))[0];

test("a turn arrow while the river is in card view keeps the nav and the results in sync", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSavedConfigStore().board = board;
  const m = mountNav(ResultNav);
  m.app.use(pinia);
  m.app.mount(m.root);
  m.isHandlerUpdated.value = true;
  await flush();
  click(actionBtn(spotDivs(m.root)[1], "Check"));
  await flush();
  click(actionBtn(spotDivs(m.root)[2], "Check"));
  await flush();
  m.dealtCard.value = 20;
  await flush(); // turn
  click(actionBtn(spotDivs(m.root)[4], "Check"));
  await flush();
  click(actionBtn(spotDivs(m.root)[5], "Check"));
  await flush();
  m.dealtCard.value = 30;
  await flush(); // river
  click(spotDivs(m.root)[6]);
  await flush(); // river chance mode
  let last = m.updates[m.updates.length - 1];
  expect(last[1]?.index).toBe(6);
  // Right arrow of the turn spot (index 3)
  const arrows = findAll(spotDivs(m.root)[3], (n) => n.tag === "button");
  click(arrows[2]);
  await flush(40);
  last = m.updates[m.updates.length - 1];
  const ringed = spotDivs(m.root)
    .filter((d) => d.props.class.includes("ring-ip"))
    .map((d) => spotDivs(m.root).indexOf(d));
  expect(ringed).toEqual(last[1] ? [last[1].index] : []);
});
