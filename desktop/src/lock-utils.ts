// Node lock helpers without dependencies (combo strings as the engine writes them).
import type { NodeLock } from "./invokes";

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

const parseCard = (s: string) => 4 * RANKS.indexOf(s[0]) + SUITS.indexOf(s[1]);
const cardString = (card: number) => RANKS[card >>> 2] + SUITS[card & 3];

/**
 * Suit of `from`'s frame -> suit of `to`'s frame, for two mirror lines (same engine node): the
 * dealt cards that differ (turn, then river) each swap two suits, composed in order.
 */
const suitMap = (from: number[], to: number[]) => {
  let map = [0, 1, 2, 3];
  from.forEach((card, i) => {
    if (card === to[i]) return;
    const [a, b] = [map[card & 3], to[i] & 3];
    if (a !== b) map = map.map((s) => (s === a ? b : s === b ? a : s));
  });
  return map;
};

/**
 * Re-expresses `edits` (combo → frequencies), written for the line `from`, for the mirror
 * line `to` (same engine node, dealt cards of other suits). Combo strings keep the engine
 * order (higher card id first).
 */
export const mirrorEdits = (
  edits: Record<string, number[]>,
  from: number[],
  to: number[]
): Record<string, number[]> => {
  const map = suitMap(from, to);
  const swap = (card: number) => (card & ~3) + map[card & 3];
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

/** A lock in the frame of its key: the same lock captured from a mirror line compares equal. */
const lockContent = (lock: NodeLock) => {
  const hands = mirrorEdits(lock.hands, lock.history, lock.key);
  const edited = Object.keys(
    mirrorEdits(
      Object.fromEntries(lock.edited.map((combo) => [combo, []])),
      lock.history,
      lock.key
    )
  );
  return JSON.stringify([
    lock.key,
    lock.actions,
    edited.sort(),
    Object.keys(hands)
      .sort()
      .map((combo) => [combo, hands[combo]]),
  ]);
};

/**
 * Whether the locks to re-solve with (`locks`) differ from those the solution was solved
 * with: added, removed or changed locks (order ignored).
 */
export const hasPendingLocks = (
  locks: NodeLock[],
  solutionLocks: NodeLock[]
): boolean => {
  const set = (list: NodeLock[]) => list.map(lockContent).sort().join("\n");
  return set(locks) !== set(solutionLocks);
};

/** Whether two lock keys name the same node. */
export const sameKey = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
