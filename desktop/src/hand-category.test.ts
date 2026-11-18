import { describe, expect, test } from "vitest";
import {
  drawCategory,
  equityBucket,
  equityRange,
  handCategory,
} from "./hand-category";

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

/** "AhKd" → card ids (rank * 4 + suit). */
const cards = (s: string): number[] => {
  const ids: number[] = [];
  for (let i = 0; i < s.length; i += 2) {
    ids.push(RANKS.indexOf(s[i]) * 4 + SUITS.indexOf(s[i + 1]));
  }
  return ids;
};
const hole = (s: string) => cards(s) as [number, number];

const hands: [string, string, string][] = [
  // Unpaired rainbow board.
  ["AsKs", "Kh9d4c", "Top pair"],
  ["Qs9s", "Kh9d4c", "Second pair"],
  ["5s4s", "Kh9d4c", "Third pair"],
  ["QsQd", "Kh9d4c", "Second pair"],
  ["7s7d", "Kh9d4c", "Third pair"],
  ["3s3d", "Kh9d4c", "Underpair"],
  ["AsAd", "Kh9d4c", "Overpair"],
  ["9s9h", "Kh9d4c", "Set"],
  ["Ks9s", "Kh9d4c", "Two pair"],
  ["AsQd", "Kh9d4c", "Ace high"],
  ["QsJd", "Kh9d4c", "No made hand"],
  // Paired board: its own pair is ignored (as GTO Wizard does).
  ["As4s", "KhKd4c", "Second pair"],
  ["8s8d", "KhKd4c", "Second pair"],
  ["2s2d", "KhKd4c", "Underpair"],
  ["AsAd", "KhKd4c", "Overpair"],
  ["KsQs", "KhKd4c", "Trips"],
  ["Ks4s", "KhKd4c", "Fullhouse"],
  ["4s4d", "KhKd4c", "Fullhouse"],
  ["KsKc", "KhKd4c", "Quads"],
  ["QsJs", "KhKd4c", "No made hand"],
  // The board's straight or flush plays.
  ["AsKd", "9h8d7c6s5h", "Ace high"],
  ["QsJd", "9h8d7c6s5h", "No made hand"],
  ["Ts2d", "9h8d7c6s5h", "Straight"],
  ["3s3d", "AhKh7h4h2h", "Third pair"],
  ["QhJd", "AhKh7h4h2h", "Flush"],
  ["QsJs", "AhKh7h4h2h", "No made hand"],
  // Wheel and straight flush.
  ["2s5d", "Ah4d3c", "Straight"],
  ["ThJh", "9h8h7h", "Straight flush"],
];

describe("handCategory", () => {
  test.each(hands)("%s on %s is %s", (h, board, expected) => {
    expect(handCategory(hole(h), cards(board))).toBe(expected);
  });
});

const draws: [string, string, string][] = [
  ["AhQh", "Kh9h4c", "Flush draw"],
  ["QsJs", "Kh9d4c", "Gutshot"],
  ["8s7s", "Th9d2c", "OESD"],
  ["QsJs", "Th9d2c", "OESD"],
  ["AsJd", "Kh9d4c", "BDSD"],
  ["As3s", "Kh9d4c", "BDSD"],
  ["As3s", "Kh9d4s", "BDFD 2 cards"],
  ["AhQd", "Kh9h4c", "BDFD 1 card"],
  ["As3d", "5h4d2c", "No draw"],
  ["7s2d", "Kh9d4c", "No draw"],
  ["AhQh", "Kh9h4c2d", "Flush draw"],
  ["AhQh", "Kh9h4c2d7h", "No draw"],
];

describe("drawCategory", () => {
  test.each(draws)("%s on %s is %s", (h, board, expected) => {
    expect(drawCategory(hole(h), cards(board))).toBe(expected);
  });
});

describe("equity buckets", () => {
  test("simple buckets", () => {
    expect(equityBucket(0.75)).toBe("Best hands");
    expect(equityBucket(0.5)).toBe("Good hands");
    expect(equityBucket(0.33)).toBe("Weak hands");
    expect(equityBucket(0.3299)).toBe("Trash hands");
  });

  test("advanced ranges", () => {
    expect(equityRange(1)).toBe("Equity 90-100");
    expect(equityRange(0.25)).toBe("Equity 25-50");
    expect(equityRange(0.2499)).toBe("Equity 0-25");
    expect(equityRange(0.6)).toBe("Equity 60-70");
  });
});
