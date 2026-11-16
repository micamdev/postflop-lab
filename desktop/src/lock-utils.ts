// Node lock helpers without dependencies (combo strings as the engine writes them).

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

const parseCard = (s: string) => 4 * RANKS.indexOf(s[0]) + SUITS.indexOf(s[1]);
const cardString = (card: number) => RANKS[card >>> 2] + SUITS[card & 3];

/**
 * Re-expresses `edits` (combo → frequencies), written for the line `from`, for the mirror
 * line `to` (same engine node, turn of another suit): the two suits of the turn cards are
 * swapped in every combo. Combo strings keep the engine order (higher card id first).
 */
export const mirrorEdits = (
  edits: Record<string, number[]>,
  from: number[],
  to: number[]
): Record<string, number[]> => {
  // The first difference between two lines with the same key is the turn card.
  const i = from.findIndex((card, k) => card !== to[k]);
  if (i === -1) return { ...edits };
  const a = from[i] & 3;
  const b = to[i] & 3;
  const swap = (card: number) => {
    const suit = card & 3;
    return suit === a ? card - a + b : suit === b ? card - b + a : card;
  };
  return Object.fromEntries(
    Object.entries(edits).map(([combo, freqs]) => {
      const [x, y] = [combo.slice(0, 2), combo.slice(2, 4)].map((c) =>
        swap(parseCard(c))
      );
      const [hi, lo] = x > y ? [x, y] : [y, x];
      return [cardString(hi) + cardString(lo), freqs];
    })
  );
};
