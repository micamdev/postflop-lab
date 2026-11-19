// The bet size fields of a setup (OOP and IP, per street: bet, raise, and OOP's donk bets),
// listed once for the store, the validation, the engine arguments and the saved trees.

export const BET_FIELDS = [
  "oopFlopBet",
  "oopFlopRaise",
  "oopTurnBet",
  "oopTurnRaise",
  "oopTurnDonk",
  "oopRiverBet",
  "oopRiverRaise",
  "oopRiverDonk",
  "ipFlopBet",
  "ipFlopRaise",
  "ipTurnBet",
  "ipTurnRaise",
  "ipRiverBet",
  "ipRiverRaise",
] as const;

export type BetField = (typeof BET_FIELDS)[number];

/** The bet size fields of a setup, as typed (e.g. "33, 75"). */
export type BetFields = Record<BetField, string>;

/** Raise sizes accept more forms (e.g. "2.5x") than bet sizes. */
export const isRaiseField = (field: BetField) => field.endsWith("Raise");

/** OOP's donk bets, only used with the donk option. */
export const isDonkField = (field: BetField) => field.endsWith("Donk");

/** "OOP flop bet": the field's name in messages. */
export const betFieldName = (field: BetField) => {
  const [, player, street, kind] = field.match(
    /^(oop|ip)(\w+?)(Bet|Raise|Donk)$/
  )!;
  return `${player.toUpperCase()} ${street.toLowerCase()} ${kind.toLowerCase()}`;
};
