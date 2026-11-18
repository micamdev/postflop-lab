/* eslint-disable @typescript-eslint/no-explicit-any -- mocked IPC payloads */
import { describe, expect, test, vi, beforeEach } from "vitest";

type Call = { cmd: string; args: any };
const calls: Call[] = [];
let gate: Promise<void> | null = null;
const actionsFor: (append: number[]) => string[] = () => ["Check:0", "Bet:30"];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: any) => {
    calls.push({ cmd, args });
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
        return actionsFor(args.append);
      case "game_total_bet_amount":
        return [0, 0];
      case "game_possible_cards":
        return "0";
      case "game_cancel_subgame":
        return null;
      default:
        throw new Error("unexpected " + cmd);
    }
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));

import { createPinia, setActivePinia } from "pinia";
import ResultNav from "../ResultNav.vue";
import { useSavedConfigStore } from "../../store";
import { mountNav, findAll, click, flush, textOf } from "./harness";

describe("ResultNav races", () => {
  beforeEach(() => {
    calls.length = 0;
    gate = null;
  });

  test("a second click during a navigation is ignored: line and results stay together", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const cfg = useSavedConfigStore();
    cfg.board = [0, 5, 10];
    cfg.startingPot = 60;
    cfg.effectiveStack = 300;
    const m = mountNav(ResultNav);
    m.app.use(pinia);
    m.app.mount(m.root);
    m.isHandlerUpdated.value = true;
    await flush();
    expect(m.updates.length).toBe(1);
    // Root OOP spot: buttons "Check" and "Bet 30"
    const buttons = findAll(
      m.root,
      (n) => n.tag === "button" && /Check|Bet/.test(textOf(n))
    );
    expect(buttons.length).toBe(2);
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    calls.length = 0;
    click(buttons[0]); // Check
    await flush(); // lock propagates to the prop
    click(buttons[1]); // Bet, while the Check navigation is running
    await flush();
    gate = null;
    release();
    await flush(40);
    const applied = calls
      .filter((c) => c.cmd === "game_apply_history")
      .map((c) => c.args.history);
    const last = m.updates[m.updates.length - 1];
    const line = last[6];
    // Results were computed for the history actually applied on the backend:
    expect(line.history).toEqual(applied[applied.length - 1]);
  });
});
