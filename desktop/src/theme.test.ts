/// <reference types="node" />
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { THEME_TOKENS, themeColor } from "./theme";

describe("theme", () => {
  test("every token used by the code is defined in style.css", () => {
    // Tests run from desktop/.
    const css = readFileSync("src/style.css", "utf8");
    for (const token of THEME_TOKENS) {
      expect(css, token).toMatch(
        new RegExp(`--${token}: [0-9]+ [0-9]+ [0-9]+;`)
      );
    }
  });

  test("a color for inline styles reads the CSS variable", () => {
    expect(themeColor("weight")).toBe("rgb(var(--weight))");
  });
});
