export const ranks = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
];

export const suits = ["♣", "♦", "♥", "♠"];
export const suitLetters = ["c", "d", "h", "s"];

const rankPat = "[AaKkQqJjTt2-9]";
const comboPat = `(?:(?:${rankPat}{2}[os]?)|(?:(?:${rankPat}[cdhs]){2}))`;
const weightPat = "(?:(?:[01](\\.\\d*)?)|(?:\\.\\d+))";
const cardRegex = new RegExp(`^(${rankPat})([cdhs])$`);
export const trimRegex = /\s*([-:,])\s*/g;
export const rangeRegex = new RegExp(
  `^(?<range>${comboPat}(?:\\+|(?:-${comboPat}))?)(?::(?<weight>${weightPat}))?$`
);

const suitClasses = [
  "text-green-600",
  "text-blue-600",
  "text-pink-600",
  "text-black",
];

export const cardText = (card: number) => {
  return {
    rank: ranks[card >>> 2],
    suit: suits[card & 3],
    suitLetter: suitLetters[card & 3],
    colorClass: suitClasses[card & 3],
  };
};

export const cardId = (rank: number, suit: number) => {
  return 4 * rank + suit;
};

export const parseCardString = (text: string) => {
  const match = text.match(cardRegex);
  if (!match) return null;

  const rank = ranks.indexOf(match[1].toUpperCase());
  const suit = suitLetters.indexOf(match[2]);
  return cardId(rank, suit);
};

export const cardPairCellIndex = (card1: number, card2: number) => {
  if (card1 > card2) [card1, card2] = [card2, card1];
  const hr = card2 >>> 2;
  const lr = card1 >>> 2;
  const hs = card2 & 3;
  const ls = card1 & 3;
  const isSuited = hs === ls;
  return {
    row: 12 - (isSuited ? hr : lr),
    col: 12 - (isSuited ? lr : hr),
    index: isSuited
      ? 3 - hs
      : hr === lr
        ? 6 - ((ls * (5 - ls)) / 2 + hs)
        : 11 - (3 * hs + ls - +(hs < ls)),
  };
};

export const cardPairOrder = (pair: number) => {
  let card1 = pair & 0xff;
  let card2 = pair >>> 8;
  if (card2 === 0xff) return card1;
  if (card1 > card2) [card1, card2] = [card2, card1];
  const hr = card2 >>> 2;
  const lr = card1 >>> 2;
  let hs = card2 & 3;
  let ls = card1 & 3;
  const isPair = hr === lr;
  const isSuited = hs === ls;
  if (isPair) [hs, ls] = [ls, hs];
  return ((((hr * 2 + +isPair) * 2 + +isSuited) * 16 + lr) * 4 + hs) * 4 + ls;
};

export const average = (values: number[], weights: number[]): number => {
  let sum = 0;
  let totalWeight = 0;
  for (let i = 0; i < values.length; ++i) {
    sum += values[i] * weights[i];
    totalWeight += weights[i];
  }
  return sum / totalWeight;
};

/** Equity tranches, highest first: a hand with equity e is in the first one with e >= bound. */
export const EQUITY_BUCKET_BOUNDS = [0.9, 0.75, 0.5, 0];

/**
 * Share of a range (weighted like the average equity) in each equity tranche: >= 90%,
 * 75-90%, 50-75%, < 50%. The shares sum to 1; all NaN for an empty range.
 */
export const equityBuckets = (
  equity: number[],
  weights: number[]
): number[] => {
  const sums = EQUITY_BUCKET_BOUNDS.map(() => 0);
  let total = 0;
  for (let i = 0; i < equity.length; ++i) {
    const w = weights[i];
    if (!w) continue;
    const bucket = EQUITY_BUCKET_BOUNDS.findIndex(
      (bound) => equity[i] >= bound
    );
    sums[bucket === -1 ? sums.length - 1 : bucket] += w;
    total += w;
  }
  return total > 0 ? sums.map((s) => s / total) : sums.map(() => Number.NaN);
};

/**
 * Who holds more of the strongest hands, from the shares of each range per equity tranche
 * (`equityBuckets`), with a 1-point margin: the 90%+ tranche (`top` = 1, nut advantage)
 * or the 90%+ and 75-90% tranches (`top` = 2, best hands advantage). "None (...)" says
 * that neither range has the edge; "—" when there is no data.
 */
export const nutAdvantageText = (
  oop: number[],
  ip: number[],
  top: 1 | 2 = 1
): string => {
  const share = (shares: number[]) =>
    shares.slice(0, top).reduce((sum, x) => sum + x, 0);
  const [a, b] = [share(oop), share(ip)];
  const at = top === 1 ? "90%+" : "75%+";
  if (isNaN(a) || isNaN(b)) return "—";
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  if (Math.abs(a - b) < 0.01) {
    return `None (OOP ${pct(a)} vs IP ${pct(b)} at ${at})`;
  }
  return a > b
    ? `OOP (${pct(a)} vs ${pct(b)} at ${at})`
    : `IP (${pct(b)} vs ${pct(a)} at ${at})`;
};

/** "-" for an undefined value, "∞" / "-∞" for an infinite one, else null. */
const nonFinite = (value: number) =>
  Number.isNaN(value)
    ? "-"
    : !isFinite(value)
      ? value < 0
        ? "-∞"
        : "∞"
      : null;

/** `value` with `digits` decimals, without "-0.0" for values that round to zero. */
const fixed = (value: number, digits: number) => {
  const special = nonFinite(value);
  if (special !== null) return special;
  if (Math.abs(value) < 0.5 * 10 ** -digits) return (0).toFixed(digits);
  return value.toFixed(digits);
};

export const toFixed1 = (value: number) => fixed(value, 1);
export const toFixed2 = (value: number) => fixed(value, 2);
export const toFixed3 = (value: number) => fixed(value, 3);

/** Equity realization: EV / (pot × equity); NaN when it is undefined (no equity). */
export const eqrOf = (ev: number, equity: number, pot: number) => {
  const eqr = ev / (pot * equity);
  return isFinite(eqr) ? eqr : Number.NaN;
};

/** Decimals to show EVs with: 3 below 10 chips, 2 below 100, else 1. */
export const evDigitsFor = (evs: number[]) => {
  const max = Math.max(0, ...evs.filter(isFinite).map(Math.abs));
  return max < 9.9995 ? 3 : max < 99.995 ? 2 : 1;
};

export const toFixed = [toFixed1, toFixed2, toFixed3];

export const toFixedAdaptive = (value: number) => {
  const abs = Math.abs(value);
  if (abs < 10) return toFixed3(value);
  if (abs < 100) return toFixed2(value);
  return toFixed1(value);
};

export const capitalize = (s: string) => {
  return (s && s[0].toUpperCase() + s.slice(1)) || "";
};

export const colorString = (color: {
  red: number;
  green: number;
  blue: number;
}) => {
  const red = color.red.toString(16).padStart(2, "0");
  const green = color.green.toString(16).padStart(2, "0");
  const blue = color.blue.toString(16).padStart(2, "0");
  return `#${red}${green}${blue}`;
};

const parseFloat = (s: string): number => {
  if (!s || /[beox+-]/.test(s)) {
    return Number.NaN;
  } else {
    return Number(s);
  }
};

/** A size may be typed with a trailing "%" ("50%" = "50"). */
const withoutPercent = (s: string) => (s.endsWith("%") ? s.slice(0, -1) : s);

export const MAX_AMOUNT = 30000;
export const MAX_BET_SIZES = 30;

export const sanitizeBetString = (
  s: string,
  is_raise: boolean
): { s: string; valid: boolean } => {
  const trimmed = s.trim();
  if (trimmed === "") return { s: "", valid: true };

  const split = trimmed.split(",").flatMap((s) => s.trim().split(" "));
  const elements = split.map((s) => s.toLowerCase());

  if (elements[elements.length - 1] === "") {
    elements.pop();
  }

  if (elements.length > MAX_BET_SIZES) {
    return { s: "Too many bet sizes", valid: false };
  }

  let sanitized = "";

  for (const e of elements) {
    if (sanitized !== "") {
      sanitized += ", ";
    }
    if (e === "") {
      return { s: "Found empty string", valid: false };
    } else if (e.endsWith("x")) {
      // Previous bet relative
      if (!is_raise) {
        return {
          s: `Multiplicative size is not allowed: ${e}`,
          valid: false,
        };
      } else {
        const float = parseFloat(e.slice(0, -1));
        if (Number.isNaN(float)) {
          return { s: `Invalid multiplicative size: ${e}`, valid: false };
        } else if (float <= 1.0) {
          return { s: `Multiplier must be greater than 1: ${e}`, valid: false };
        } else {
          sanitized += `${float}x`;
        }
      }
    } else if (e.includes("c")) {
      // Additive
      const split = e.split("c");
      if (split.length !== 2) {
        return { s: `Invalid additive size: ${e}`, valid: false };
      }
      const float1 = parseFloat(split[0]);
      if (Number.isNaN(float1)) {
        return { s: `Invalid additive size: ${e}`, valid: false };
      } else if (float1 % 1 !== 0) {
        return { s: `Addition size must be an integer: ${e}`, valid: false };
      } else if (float1 > MAX_AMOUNT) {
        return { s: `Addition size too large: ${e}`, valid: false };
      }
      if (split[1] === "") {
        sanitized += `${float1}c`;
      } else {
        if (!split[1].endsWith("r")) {
          return { s: `Invalid additive size: ${e}`, valid: false };
        }
        if (!is_raise) {
          return {
            s: `Addition with raise cap is not allowed: ${e}`,
            valid: false,
          };
        }
        const float2 = parseFloat(split[1].slice(0, -1));
        if (Number.isNaN(float2)) {
          return { s: `Invalid additive size: ${e}`, valid: false };
        } else if (float2 % 1 !== 0 || float2 === 0) {
          return {
            s: `Raise cap must be a positive integer: ${e}`,
            valid: false,
          };
        } else if (float2 > 100) {
          return { s: `Raise cap too large: ${e}`, valid: false };
        }
        sanitized += `${float1}c${float2}r`;
      }
    } else if (e.includes("e")) {
      // Geometric
      const split = e.split("e");
      if (split.length !== 2) {
        return { s: `Invalid geometric size: ${e}`, valid: false };
      }
      const float1 = split[0] === "" ? null : parseFloat(split[0]);
      const float2 =
        split[1] === "" ? null : parseFloat(withoutPercent(split[1]));
      if (float1 !== null) {
        if (Number.isNaN(float1)) {
          return { s: `Invalid geometric size: ${e}`, valid: false };
        } else if (float1 % 1 !== 0 || float1 === 0) {
          return {
            s: `Geometric size must be a positive integer: ${e}`,
            valid: false,
          };
        } else if (float1 > 100) {
          return { s: `Geometric size too large: ${e}`, valid: false };
        }
      }
      if (float2 !== null && Number.isNaN(float2)) {
        return { s: `Invalid geometric size: ${e}`, valid: false };
      }
      sanitized += `${float1 ?? ""}e${float2 ?? ""}`;
    } else if (e === "a") {
      // All-in
      sanitized += "a";
    } else {
      // Pot relative
      const float = parseFloat(withoutPercent(e));
      if (Number.isNaN(float)) {
        return { s: `Invalid bet size: ${e}`, valid: false };
      }
      sanitized += `${float}`;
    }
  }

  return { s: sanitized, valid: true };
};

export const convertBetString = (s: string): string => {
  if (s === "") return s;
  return s
    .split(",")
    .map((e) => e.trim())
    .map((e) => ("acerx%".includes(e[e.length - 1]) ? e : e + "%"))
    .join(",");
};

const parseBetAmount = (s: string, index: number) => {
  let indexEnd = index;
  while (indexEnd < s.length && /\d/.test(s[indexEnd])) indexEnd++;
  const amount = Number(s.slice(index, indexEnd));
  return { amount, indexEnd };
};

export const ROOT_LINE_STRING = "(Root)";
export const INVALID_LINE_STRING = "Invalid line string";

export const readableLineString = (s: string): string => {
  if (s === ROOT_LINE_STRING) return s;

  let ret = "";
  let index = 0;
  let isSeparatorExpected = false;

  while (index < s.length) {
    let isOk = false;

    switch (s[index]) {
      case "-":
      case "|": {
        ret += s[index] === "-" ? " - " : ", ";
        index += 1;
        isOk = isSeparatorExpected;
        break;
      }
      case "F":
      case "X":
      case "C": {
        ret += { F: "Fold", X: "Check", C: "Call" }[s[index]];
        index += 1;
        isOk = !isSeparatorExpected;
        break;
      }
      case "B":
      case "R":
      case "A": {
        const { amount, indexEnd } = parseBetAmount(s, index + 1);
        ret += { B: "Bet", R: "Raise", A: "All-in" }[s[index]] + ` ${amount}`;
        index = indexEnd;
        isOk = !isSeparatorExpected && amount > 0;
        break;
      }
    }

    if (!isOk) {
      return INVALID_LINE_STRING;
    }

    isSeparatorExpected = !isSeparatorExpected;
  }

  if (!isSeparatorExpected) {
    return INVALID_LINE_STRING;
  }

  return ret;
};

/** Human-readable size, e.g. "1.25 GB" or "740 MB". */
export const formatBytes = (bytes: number): string => {
  if (bytes >= 1023.5 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
  if (bytes >= 1023.5 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(0) + " MB";
  }
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
};

/** Card chip backgrounds by suit (clubs, diamonds, hearts, spades). */
export const suitBgClasses = [
  "bg-[#3e9e5c]",
  "bg-[#3d7fd6]",
  "bg-[#d8455b]",
  "bg-[#4b5263]",
];

/** Suit text colours readable on the dark Graphite panels (clubs, diamonds, hearts, spades). */
/** Suit colors for charts (clubs, diamonds, hearts, spades; spades lighter on dark). */
export const suitChartColors = ["#3e9e5c", "#3d7fd6", "#d8455b", "#9aa0ad"];

export const suitTextClasses = [
  "text-[#5fbf7f]",
  "text-[#6b9cf0]",
  "text-[#ef6a7e]",
  "text-[#c3c7d1]",
];

/** Engine weight (f32, 0–1) as a percentage rounded to 0.01 (f32 0.7 is 70, not 69.9999988). */
export const weightPercent = (weight: number) =>
  Math.round(weight * 10000) / 100;
