// The spots of the results navigation bar: pure helpers (no IPC, no component state).

import { ALL_IN, actionColor } from "./action-colors";
import type { Spot, SpotChance, SpotPlayer } from "./result-types";
import { cardText } from "./utils";
import { bbText } from "./units";

/** Colour of action `i` of `actions` ("Name:amount"), bets ranked by amount. */
const colorOf = (actions: string[], i: number, numBetActions: number) => {
  const name = actions[i].split(":")[0];
  const hasAllIn = actions[actions.length - 1].split(":")[0] === ALL_IN;
  const numBets = numBetActions - (hasAllIn ? 1 : 0);
  return actionColor(name, i - (actions.length - numBetActions), numBets);
};

/** The pot when a street starts and the largest bet made on it so far (amounts per street). */
export type StreetBets = { pot: number; bet: number };

/** The street's pot and the bet to face at spot `index`, from the actions chosen before it. */
export const streetBets = (spots: Spot[], index: number): StreetBets => {
  let start = index - 1;
  while (start > 0 && spots[start].type !== "chance") --start;
  const first = spots[start];
  const pot = first.type === "root" || first.type === "chance" ? first.pot : 0;
  let bet = 0;
  for (const spot of spots.slice(start + 1, index)) {
    if (spot.type !== "player") continue;
    const action = spot.actions[spot.selectedIndex];
    if (action && action.amount !== "0") bet = Number(action.amount);
  }
  return { pot, bet };
};

/**
 * A bet or raise size in % of the pot, as the tree builds it (Pio, GTO Wizard): a bet over
 * the pot, a raise's increase over the pot after calling. Null for fold, check, call and
 * all-in (its size is the stack, not a choice).
 */
export const potPercent = (
  name: string,
  amount: string,
  street: StreetBets
): number | null => {
  if (name !== "Bet" && name !== "Raise") return null;
  const potAfterCall = street.pot + 2 * street.bet;
  if (potAfterCall <= 0) return null;
  return ((Number(amount) - street.bet) / potAfterCall) * 100;
};

/** "Bet 1.8 · 33%": the amount in big blinds, then the % of the pot when there is one. */
export const actionText = (action: {
  name: string;
  amount: string;
  percent: number | null;
}) => {
  if (action.amount === "0") return action.name;
  const percent =
    action.percent === null ? "" : ` · ${Math.round(action.percent)}%`;
  return `${action.name} ${bbText(Number(action.amount))}${percent}`;
};

/** The actions of a spot ("Name:amount") with their colours. Fold, check and call (amount 0)
 * come first; the others are bets and raises, ranked by amount for their colour. With the
 * street's bets, each bet or raise also gets its % of the pot. */
export const toSpotActions = (
  actions: string[],
  street?: StreetBets
): SpotPlayer["actions"] => {
  const numBetActions = actions.filter((a) => a.split(":")[1] !== "0").length;
  return actions.map((action, i) => {
    const [name, amount] = action.split(":");
    return {
      index: i,
      name,
      amount,
      percent: street ? potPercent(name, amount, street) : null,
      isSelected: false,
      color: colorOf(actions, i, numBetActions),
    };
  });
};

/** Actions and cards chosen from the root up to (not including) the spot `end`. */
export const historyOf = (spots: Spot[], end: number, start = 1): number[] =>
  spots.slice(start, end).map((spot) => spot.selectedIndex);

/** History and readable line up to the spot `end` (e.g. "OOP Check, IP Bet 3, T♥"). */
export const lineOf = (spots: Spot[], end: number) => {
  const label = spots
    .slice(1, end)
    .map((spot) => {
      if (spot.type === "chance") {
        if (spot.selectedIndex === -1) return "?";
        const card = cardText(spot.selectedIndex);
        return card.rank + card.suit;
      }
      if (spot.type !== "player") return "";
      const action = spot.actions[spot.selectedIndex];
      const amount =
        !action || action.amount === "0"
          ? ""
          : ` ${bbText(Number(action.amount))}`;
      return `${spot.player.toUpperCase()} ${action?.name ?? "?"}${amount}`;
    })
    .join(", ");
  return { history: historyOf(spots, end), label: label || "Root" };
};

/** `board` plus the cards dealt before the spot `end`, up to the first skipped card. */
export const boardAt = (board: number[], spots: Spot[], end: number) => {
  const result = [...board];
  for (let i = 3; i < end; ++i) {
    const spot = spots[i];
    if (spot.type === "chance") {
      if (spot.selectedIndex === -1) return result;
      result.push(spot.selectedIndex);
    }
  }
  return result;
};

/** The 52 cards of a chance spot, dead unless their bit is set in `possible`. */
export const cardsFromMask = (possible: bigint): SpotChance["cards"] =>
  Array.from({ length: 52 }, (_, i) => ({
    card: i,
    isSelected: false,
    isDead: !(possible & (1n << BigInt(i))),
  }));

/** Next live card from the selected one: same suit by rank (`rankDir`), or same rank by suit
 * (`suitDir`); -1 if none. */
export const nextLiveCard = (
  spot: SpotChance,
  rankDir: number,
  suitDir: number
) => {
  const step = rankDir ? 4 * rankDir : suitDir;
  const rank = spot.selectedIndex >>> 2;
  for (
    let card = spot.selectedIndex + step;
    0 <= card && card < 52 && (rankDir || card >>> 2 === rank);
    card += step
  ) {
    if (!spot.cards[card].isDead) return card;
  }
  return -1;
};
