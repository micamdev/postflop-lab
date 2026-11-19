// Texture of a flop (cards: 4 * rank + suit, rank 0 = deuce, 12 = ace) and its weight.

export type FlopTexture = {
  suits: "monotone" | "two-tone" | "rainbow";
  pairing: "unpaired" | "paired" | "trips";
  /** By the highest card: A to J, T to 8, 7 to 2. */
  height: "high" | "middle" | "low";
  /** A straight is possible with two hole cards (3 distinct ranks within 5, ace low too). */
  connected: boolean;
};

const RANK_CHARS = "23456789TJQKA";

export const flopTexture = (board: number[]): FlopTexture => {
  const ranks = board.map((card) => card >>> 2);
  const numSuits = new Set(board.map((card) => card & 3)).size;
  const distinct = [...new Set(ranks)].sort((a, b) => a - b);
  const high = distinct[distinct.length - 1];

  // Positions 0 (ace low) to 13 (ace high); a straight spans 5 consecutive positions.
  const positions = distinct.flatMap((r) => (r === 12 ? [0, 13] : [r + 1]));
  const connected =
    distinct.length === 3 &&
    positions.some(
      (start) =>
        positions.filter((p) => p >= start && p < start + 5).length >= 3
    );

  return {
    suits:
      numSuits === 1 ? "monotone" : numSuits === 2 ? "two-tone" : "rainbow",
    pairing:
      distinct.length === 3
        ? "unpaired"
        : distinct.length === 2
          ? "paired"
          : "trips",
    height: high >= 9 ? "high" : high >= 6 ? "middle" : "low",
    connected,
  };
};

/** "A high, rainbow", "8 high, two-tone, connected", "7 high, paired, rainbow". */
export const textureLabel = (board: number[]): string => {
  const texture = flopTexture(board);
  const high = Math.max(...board.map((card) => card >>> 2));
  return [
    `${RANK_CHARS[high]} high`,
    texture.pairing === "unpaired" ? null : texture.pairing,
    texture.pairing === "trips" ? null : texture.suits,
    texture.connected ? "connected" : null,
  ]
    .filter(Boolean)
    .join(", ");
};

/** The 24 permutations of the 4 suits. */
const SUIT_PERMUTATIONS = (() => {
  const result: number[][] = [];
  const permute = (rest: number[], prefix: number[]) => {
    if (rest.length === 0) result.push(prefix);
    rest.forEach((s, i) =>
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, s])
    );
  };
  permute([0, 1, 2, 3], []);
  return result;
})();

/**
 * Number of flops equal to `board` up to the suits (24 for a rainbow flop, 4 for a monotone
 * one...): how often it occurs, relative to the other flops.
 */
export const flopWeight = (board: number[]): number => {
  const variants = new Set(
    SUIT_PERMUTATIONS.map((perm) =>
      board
        .map((card) => (card & ~3) | perm[card & 3])
        .sort((a, b) => a - b)
        .join(",")
    )
  );
  return variants.size;
};

/** A texture filter of the report. */
export type TextureFilter =
  "all" | FlopTexture["suits"] | "paired" | FlopTexture["height"] | "connected";

/** Whether a flop has the feature `filter` ("paired" includes trips). */
export const matchesTexture = (board: number[], filter: TextureFilter) => {
  const t = flopTexture(board);
  switch (filter) {
    case "all":
      return true;
    case "paired":
      return t.pairing !== "unpaired";
    case "connected":
      return t.connected;
    case "high":
    case "middle":
    case "low":
      return t.height === filter;
    default:
      return t.suits === filter;
  }
};
