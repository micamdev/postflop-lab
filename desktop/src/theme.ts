// Theme colors for inline styles and charts. The values live in src/style.css (Graphite
// theme), as for the Tailwind classes: one place to change a color.

export const THEME_TOKENS = [
  "ink",
  "cell",
  "oop",
  "ip",
  "weight",
  "no-value",
  "scroll-target",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

/** A theme color for inline styles (CSS gradients, backgrounds). */
export const themeColor = (token: ThemeToken) => `rgb(var(--${token}))`;

/**
 * A theme color resolved to its value, for canvas charts (which cannot read variables),
 * optionally with an opacity.
 */
export const resolvedThemeColor = (token: ThemeToken, alpha = 1) => {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${token}`)
    .trim();
  return alpha === 1 ? `rgb(${value})` : `rgb(${value} / ${alpha})`;
};
