// Action colours, by solver convention: check / call green, fold blue, bets and raises in reds
// getting darker with size, all-in the darkest.

export const ACTION_COLORS = {
  check: "#3fae6e",
  fold: "#4f86c6",
  betSmall: "#e0704f",
  betMid: "#c4473a",
  betLarge: "#9e2f2b",
  allIn: "#7a1f1c",
};

const BET_RAMP = [
  ACTION_COLORS.betSmall,
  ACTION_COLORS.betMid,
  ACTION_COLORS.betLarge,
];

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (values: number[]) =>
  "#" + values.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** `t` in [0, 1] along the small → mid → large bet ramp. */
const betRamp = (t: number) => {
  const position = t * (BET_RAMP.length - 1);
  const i = Math.min(Math.floor(position), BET_RAMP.length - 2);
  const r = position - i;
  const [a, b] = [rgb(BET_RAMP[i]), rgb(BET_RAMP[i + 1])];
  return hex(a.map((value, k) => value * (1 - r) + b[k] * r));
};

/**
 * Colour of an action of the engine ("Fold", "Check", "Call", "Bet", "Raise", "AllIn");
 * `betRank` is the 0-based position of a bet or raise among the node's bets and raises by
 * amount, `numBets` their count (all-in excluded).
 */
export const actionColor = (
  name: string,
  betRank: number,
  numBets: number
): string => {
  if (name === "Fold") return ACTION_COLORS.fold;
  if (name === "Check" || name === "Call") return ACTION_COLORS.check;
  if (name === "AllIn") return ACTION_COLORS.allIn;
  if (numBets <= 1) return ACTION_COLORS.betSmall;
  return betRamp(betRank / (numBets - 1));
};

/** CSS gradient stacking `frequencies` (0–1) in `colors`, from the start toward `direction`. */
export const stackedGradient = (
  frequencies: number[],
  colors: string[],
  direction: "right" | "top"
): string => {
  let pos = 0;
  const stops = frequencies.map((f, i) => {
    const stop = `${colors[i]} ${pos * 100}% ${(pos + f) * 100}%`;
    pos += f;
    return stop;
  });
  return `linear-gradient(to ${direction}, ${stops.join(", ")})`;
};
