// Hand categories of a combo on a board, with GTO Wizard's names: made hand, draw and
// equity bucket. Card ids: rank = id >>> 2 (0 = deuce … 12 = ace), suit = id & 3.

export const HAND_CATEGORIES = [
  "Straight flush",
  "Quads",
  "Fullhouse",
  "Flush",
  "Straight",
  "Set",
  "Trips",
  "Two pair",
  "Overpair",
  "Top pair",
  "Second pair",
  "Third pair",
  "Underpair",
  "Ace high",
  "No made hand",
] as const;

export const DRAW_CATEGORIES = [
  "Flush draw",
  "OESD",
  "Gutshot",
  "BDFD 2 cards",
  "BDFD 1 card",
  "BDSD",
  "No draw",
] as const;

export const EQUITY_BUCKETS = [
  "Best hands",
  "Good hands",
  "Weak hands",
  "Trash hands",
] as const;

export const EQUITY_RANGES = [
  "Equity 90-100",
  "Equity 80-90",
  "Equity 70-80",
  "Equity 60-70",
  "Equity 50-60",
  "Equity 25-50",
  "Equity 0-25",
] as const;

export type HandCategory = (typeof HAND_CATEGORIES)[number];
export type DrawCategory = (typeof DRAW_CATEGORIES)[number];
export type EquityBucket = (typeof EQUITY_BUCKETS)[number];
export type EquityRange = (typeof EQUITY_RANGES)[number];

const ACE = 12;
const rankOf = (card: number) => card >>> 2;
const suitOf = (card: number) => card & 3;

/** Bit r + 1 per rank present, plus bit 0 for an ace (so that A-2-3-4-5 is a straight). */
const rankBits = (ranks: number[]): number => {
  let bits = 0;
  for (const r of ranks) bits |= 1 << (r + 1);
  if (bits & (1 << (ACE + 1))) bits |= 1;
  return bits;
};

/** Top rank of the best straight in `bits` (3 for a wheel), or -1. */
const straightTop = (bits: number): number => {
  for (let top = ACE; top >= 3; top--) {
    const mask = 0b11111 << (top - 3);
    if ((bits & mask) === mask) return top;
  }
  return -1;
};

/** Hand classes, from high card (0) to straight flush (8). */
const enum Class {
  HighCard,
  Pair,
  TwoPair,
  Trips,
  Straight,
  Flush,
  FullHouse,
  Quads,
  StraightFlush,
}

const encode = (cls: Class, ranks: number[]): number => {
  let value = cls;
  for (let i = 0; i < 5; i++)
    value = value * 16 + (i < ranks.length ? ranks[i] + 1 : 0);
  return value;
};

const classOf = (value: number): Class => Math.floor(value / 16 ** 5);

/**
 * Value of the best hand made with 1 to 7 cards; higher is better. Straights and flushes
 * need 5 cards.
 */
const handValue = (cards: number[]): number => {
  const counts = new Array<number>(13).fill(0);
  const bySuit: number[][] = [[], [], [], []];
  for (const card of cards) {
    counts[rankOf(card)]++;
    bySuit[suitOf(card)].push(rankOf(card));
  }

  const flush = bySuit.find((ranks) => ranks.length >= 5);
  if (flush) {
    const top = straightTop(rankBits(flush));
    if (top >= 0) return encode(Class.StraightFlush, [top]);
  }

  // Ranks by count then rank, high first.
  const ranks = [...Array(13).keys()]
    .filter((r) => counts[r] > 0)
    .sort((a, b) => counts[b] - counts[a] || b - a);
  const kickers = (used: number[], n: number) =>
    ranks
      .filter((r) => !used.includes(r))
      .sort((a, b) => b - a)
      .slice(0, n);

  if (counts[ranks[0]] === 4) {
    return encode(Class.Quads, [ranks[0], ...kickers([ranks[0]], 1)]);
  }
  if (counts[ranks[0]] === 3 && ranks.length > 1 && counts[ranks[1]] >= 2) {
    return encode(Class.FullHouse, [ranks[0], ranks[1]]);
  }
  if (flush) {
    return encode(Class.Flush, [...flush].sort((a, b) => b - a).slice(0, 5));
  }
  const top = straightTop(rankBits(ranks));
  if (top >= 0) return encode(Class.Straight, [top]);
  if (counts[ranks[0]] === 3) {
    return encode(Class.Trips, [ranks[0], ...kickers([ranks[0]], 2)]);
  }
  if (counts[ranks[0]] === 2 && ranks.length > 1 && counts[ranks[1]] === 2) {
    const pairs = [ranks[0], ranks[1]];
    return encode(Class.TwoPair, [...pairs, ...kickers(pairs, 1)]);
  }
  if (counts[ranks[0]] === 2) {
    return encode(Class.Pair, [ranks[0], ...kickers([ranks[0]], 3)]);
  }
  return encode(Class.HighCard, kickers([], 5));
};

const MADE: Partial<Record<Class, HandCategory>> = {
  [Class.StraightFlush]: "Straight flush",
  [Class.Quads]: "Quads",
  [Class.FullHouse]: "Fullhouse",
  [Class.Flush]: "Flush",
  [Class.Straight]: "Straight",
};

/** Made-hand category of `hole` on `board` (3 to 5 cards). */
export const handCategory = (
  hole: [number, number],
  board: number[]
): HandCategory => {
  const value = handValue([...hole, ...board]);
  const cls = classOf(value);
  const [h1, h2] = hole.map(rankOf);
  const boardCounts = new Array<number>(13).fill(0);
  for (const card of board) boardCounts[rankOf(card)]++;

  // Straight or better, only if the hole cards improve on the board.
  const quadsFromBoard =
    cls === Class.Quads && boardCounts.some((count) => count === 4);
  const boardValue = handValue(board);
  if (cls >= Class.Straight && value > boardValue && !quadsFromBoard) {
    return MADE[cls]!;
  }
  // The board makes a straight or better by itself and the hand does not beat it.
  if (classOf(boardValue) >= Class.Straight) {
    return h1 === ACE || h2 === ACE ? "Ace high" : "No made hand";
  }

  // Pair categories ignore the board's own pairs (distinct board ranks, high first).
  const distinct = [...new Set(board.map(rankOf))].sort((a, b) => b - a);
  if (h1 === h2) {
    if (boardCounts[h1] > 0) return "Set";
    if (h1 > distinct[0]) return "Overpair";
    if (h1 < distinct[distinct.length - 1]) return "Underpair";
    return h1 > distinct[1] ? "Second pair" : "Third pair";
  }
  if (boardCounts[h1] >= 2 || boardCounts[h2] >= 2) return "Trips";
  const paired = [h1, h2].filter((r) => boardCounts[r] > 0);
  if (paired.length === 2) return "Two pair";
  if (paired.length === 1) {
    const index = distinct.indexOf(paired[0]);
    return index === 0
      ? "Top pair"
      : index === 1
        ? "Second pair"
        : "Third pair";
  }
  return h1 === ACE || h2 === ACE ? "Ace high" : "No made hand";
};

/** Whether adding `extra` ranks gives a straight that needs a hole card. */
const straightWithHole = (
  holeRanks: number[],
  boardRanks: number[],
  extra: number[]
): boolean =>
  straightTop(rankBits([...holeRanks, ...boardRanks, ...extra])) >
  straightTop(rankBits([...boardRanks, ...extra]));

/** Draw category of `hole` on `board`; no draws once the river is dealt. */
export const drawCategory = (
  hole: [number, number],
  board: number[]
): DrawCategory => {
  if (board.length >= 5) return "No draw";
  const made = handCategory(hole, board);
  if (["Straight flush", "Quads", "Fullhouse", "Flush"].includes(made)) {
    return "No draw";
  }

  const all = [...hole, ...board];
  const suitCount = (cards: number[], suit: number) =>
    cards.filter((card) => suitOf(card) === suit).length;
  for (const suit of [0, 1, 2, 3]) {
    if (suitCount(all, suit) === 4 && suitCount(hole, suit) > 0) {
      return "Flush draw";
    }
  }

  const holeRanks = hole.map(rankOf);
  const boardRanks = board.map(rankOf);
  const isStraight = straightTop(rankBits([...holeRanks, ...boardRanks])) >= 0;
  if (!isStraight) {
    const seen = all.map(rankOf);
    const outRanks = [...Array(13).keys()].filter(
      (r) =>
        seen.filter((s) => s === r).length < 4 &&
        straightWithHole(holeRanks, boardRanks, [r])
    );
    if (outRanks.length >= 2) return "OESD";
    if (outRanks.length === 1) return "Gutshot";
  }

  if (board.length !== 3) return "No draw";
  const [s1, s2] = hole.map(suitOf);
  if (s1 === s2 && suitCount(board, s1) === 1) return "BDFD 2 cards";
  if (hole.some((card) => suitCount(board, suitOf(card)) === 2)) {
    return "BDFD 1 card";
  }
  if (!isStraight) {
    for (let r1 = 0; r1 < 13; r1++) {
      for (let r2 = r1; r2 < 13; r2++) {
        if (straightWithHole(holeRanks, boardRanks, [r1, r2])) return "BDSD";
      }
    }
  }
  return "No draw";
};

/** Simple equity bucket (GTO Wizard's Best / Good / Weak / Trash hands). */
export const equityBucket = (equity: number): EquityBucket =>
  equity >= 0.75
    ? "Best hands"
    : equity >= 0.5
      ? "Good hands"
      : equity >= 0.33
        ? "Weak hands"
        : "Trash hands";

/** Advanced equity range; lower bounds are inclusive. */
export const equityRange = (equity: number): EquityRange => {
  const bounds: [number, EquityRange][] = [
    [0.9, "Equity 90-100"],
    [0.8, "Equity 80-90"],
    [0.7, "Equity 70-80"],
    [0.6, "Equity 60-70"],
    [0.5, "Equity 50-60"],
    [0.25, "Equity 25-50"],
  ];
  return bounds.find(([low]) => equity >= low)?.[1] ?? "Equity 0-25";
};
