import { describe, expect, test } from "vitest";
import type { Spot, SpotChance, SpotPlayer } from "./result-types";
import {
  actionText,
  boardAt,
  cardsFromMask,
  historyOf,
  lineOf,
  nextLiveCard,
  potPercent,
  streetBets,
  toSpotActions,
} from "./nav-spots";

// Cards: 4 * rank + suit (c d h s); 2c = 0, Th = 34, Ah = 50.
const chance = (index: number, card: number, dead: number[] = []) =>
  ({
    type: "chance",
    index,
    player: "turn",
    selectedIndex: card,
    prevPlayer: "ip",
    cards: Array.from({ length: 52 }, (_, i) => ({
      card: i,
      isSelected: i === card,
      isDead: dead.includes(i),
    })),
    pot: 0,
    stack: 0,
  }) as SpotChance;

const player = (
  index: number,
  who: "oop" | "ip",
  actions: string[],
  selected: number
): SpotPlayer => ({
  type: "player",
  index,
  player: who,
  selectedIndex: selected,
  actions: toSpotActions(actions),
});

const spots: Spot[] = [
  {
    type: "root",
    index: 0,
    player: "flop",
    selectedIndex: -1,
    board: [0, 1, 2],
    pot: 10,
    stack: 100,
  },
  player(1, "oop", ["Check:0", "Bet:5"], 0),
  player(2, "ip", ["Check:0", "Bet:5"], 1),
  player(3, "oop", ["Fold:0", "Call:0", "Raise:20"], 1),
  chance(4, 34),
  player(5, "oop", ["Check:0", "Bet:10"], -1),
];

describe("toSpotActions", () => {
  test("fold, check and call first, bets ranked by amount for their colour", () => {
    const actions = toSpotActions(["Check:0", "Bet:30", "Bet:60", "Allin:100"]);
    expect(actions.map((a) => [a.index, a.name, a.amount])).toEqual([
      [0, "Check", "0"],
      [1, "Bet", "30"],
      [2, "Bet", "60"],
      [3, "Allin", "100"],
    ]);
    expect(actions.every((a) => !a.isSelected && a.color)).toBe(true);
    expect(new Set(actions.map((a) => a.color)).size).toBe(4);
  });
});

describe("bet sizes in % of the pot", () => {
  // Root pot 10: OOP checks, IP bets 5 (50%), OOP raises to 20: +15 over the pot after
  // calling (10 + 2 × 5 = 20), 75%. Amounts are per street, as the engine builds them.
  test("the street's pot and the bet to face, from the actions chosen before", () => {
    expect(streetBets(spots, 1)).toEqual({ pot: 10, bet: 0 });
    expect(streetBets(spots, 2)).toEqual({ pot: 10, bet: 0 });
    expect(streetBets(spots, 3)).toEqual({ pot: 10, bet: 5 });
    // A new street starts from its chance spot's pot.
    const turn = [
      ...spots.slice(0, 4),
      { ...chance(4, 34), pot: 50 },
      spots[5],
    ];
    expect(streetBets(turn, 5)).toEqual({ pot: 50, bet: 0 });
  });

  test("a bet over the pot, a raise's increase over the pot after calling", () => {
    expect(potPercent("Bet", "5", { pot: 10, bet: 0 })).toBe(50);
    expect(potPercent("Raise", "20", { pot: 10, bet: 5 })).toBe(75);
    for (const [name, amount] of [
      ["Check", "0"],
      ["Call", "0"],
      ["Fold", "0"],
      ["Allin", "100"],
    ]) {
      expect(potPercent(name, amount, { pot: 10, bet: 0 })).toBeNull();
    }
  });

  test("toSpotActions adds them when the street is known", () => {
    const actions = toSpotActions(["Fold:0", "Call:0", "Raise:20"], {
      pot: 10,
      bet: 5,
    });
    expect(actions.map((a) => a.percent)).toEqual([null, null, 75]);
    expect(toSpotActions(["Check:0", "Bet:5"]).map((a) => a.percent)).toEqual([
      null,
      null,
    ]);
  });

  test("labels: the amount, then the % of the pot", () => {
    expect(actionText({ name: "Bet", amount: "18", percent: 32.7 })).toBe(
      "Bet 1.8 · 33%"
    );
    expect(actionText({ name: "Bet", amount: "18", percent: null })).toBe(
      "Bet 1.8"
    );
    expect(actionText({ name: "Check", amount: "0", percent: null })).toBe(
      "Check"
    );
  });
});

describe("historyOf", () => {
  test("the selected index of each spot from the first action", () => {
    expect(historyOf(spots, 5)).toEqual([0, 1, 1, 34]);
    expect(historyOf(spots, 3)).toEqual([0, 1]);
  });
});

describe("lineOf", () => {
  test("history and readable line up to a spot", () => {
    expect(lineOf(spots, 5)).toEqual({
      history: [0, 1, 1, 34],
      label: "OOP Check, IP Bet 0.5, OOP Call, T♥",
    });
  });

  test("the root line", () => {
    expect(lineOf(spots, 1)).toEqual({ history: [], label: "Root" });
  });

  test("a skipped card reads ?", () => {
    const skipped = [...spots.slice(0, 4), chance(4, -1)];
    expect(lineOf(skipped, 5).label).toBe("OOP Check, IP Bet 0.5, OOP Call, ?");
  });
});

describe("boardAt", () => {
  test("the board plus the cards dealt before a spot", () => {
    expect(boardAt([0, 1, 2], spots, 5)).toEqual([0, 1, 2, 34]);
    expect(boardAt([0, 1, 2], spots, 4)).toEqual([0, 1, 2]);
  });

  test("stops at a skipped card", () => {
    const skipped = [...spots.slice(0, 4), chance(4, -1)];
    expect(boardAt([0, 1, 2], skipped, 5)).toEqual([0, 1, 2]);
  });
});

describe("cardsFromMask", () => {
  test("cards whose bit is not set are dead", () => {
    const cards = cardsFromMask((1n << 0n) | (1n << 51n));
    expect(cards).toHaveLength(52);
    expect(cards.filter((c) => !c.isDead).map((c) => c.card)).toEqual([0, 51]);
    expect(cards.every((c) => !c.isSelected)).toBe(true);
  });
});

describe("nextLiveCard", () => {
  test("by rank in the same suit, skipping dead cards", () => {
    // Th = 34; Jh = 38 dead, Qh = 42.
    expect(nextLiveCard(chance(4, 34, [38]), 1, 0)).toBe(42);
    expect(nextLiveCard(chance(4, 34), -1, 0)).toBe(30);
  });

  test("by suit within the same rank, -1 past it", () => {
    expect(nextLiveCard(chance(4, 34), 0, 1)).toBe(35);
    expect(nextLiveCard(chance(4, 35), 0, 1)).toBe(-1);
    expect(nextLiveCard(chance(4, 50), 1, 0)).toBe(-1);
  });
});
