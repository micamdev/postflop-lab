// Units. The engine, the saved trees, spots and solutions count chips in tenths of a big
// blind (a 5.5bb pot is 55): integers, so bet sizes round to 0.1bb. The user only sees and
// types big blinds; the conversion happens here, at the edge of the interface.

/** App units per big blind. */
export const UNITS_PER_BB = 10;

/** An app amount in big blinds. */
export const toBb = (amount: number) => amount / UNITS_PER_BB;

/** An app amount as big blinds text ("97.5", "100"), without float noise. */
export const bbText = (amount: number) =>
  String(Math.round(amount * 100) / (100 * UNITS_PER_BB));

/** A value typed in big blinds, in app units (the nearest 0.1bb). */
export const fromBb = (bb: number) => Math.round(bb * UNITS_PER_BB);

/** An EV (app units) in big blinds. */
export const evBb = (ev: number) => ev / UNITS_PER_BB;

/** Exploitability (app units) in big blinds, then in % of the pot `pot` (app units) if > 0. */
export const exploitabilityText = (exploitability: number, pot: number) => {
  const bb = `${evBb(exploitability).toFixed(3)}bb`;
  if (!(pot > 0)) return bb;
  return `${bb} (${((exploitability * 100) / pot).toFixed(2)}%)`;
};

/**
 * After an edit (change event), shows in the field the value actually kept: a typed "2.04"
 * is stored as 2bb, and the field must not keep saying 2.04.
 */
export const showStored = (event: Event, stored: unknown) => {
  const input = event.target as HTMLInputElement;
  if (typeof stored === "number" && Number.isFinite(stored)) {
    input.value = String(stored);
  }
};
