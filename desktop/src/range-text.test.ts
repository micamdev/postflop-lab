import { describe, expect, test } from "vitest";
import { parseRangeText } from "./range-text";

describe("parseRangeText", () => {
  test("trims spaces and a trailing comma", () => {
    expect(parseRangeText("AA, KQs ,")).toEqual({ ok: true, text: "AA,KQs" });
  });

  test("names the part it cannot read", () => {
    expect(parseRangeText("AA,ZZ")).toEqual({
      ok: false,
      error: "Failed to parse range: ZZ",
    });
    expect(parseRangeText("AA,,KK")).toEqual({
      ok: false,
      error: "Failed to parse range: (empty string)",
    });
  });

  test("an empty text is an empty range", () => {
    expect(parseRangeText("")).toEqual({ ok: true, text: "" });
  });
});
