// Rust sends NaN and infinite floats as JSON null (serde_json): the front end works with NaN.

/** Each number of `rows`, with null replaced by NaN. */
export const withNaN = (rows: number[][]): number[][] =>
  rows.map((row) => row.map((x) => x ?? Number.NaN));
