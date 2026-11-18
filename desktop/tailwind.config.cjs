/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["src/**/*.ts", "src/**/*.vue"],
  // `trimRegex` in src/utils.ts (/\s*([-:,])\s*/g) looks like the arbitrary
  // property class `[-:,]` to Tailwind's scanner and yields invalid CSS
  // (`-: ,;`), which Vite 8's CSS minifier rejects.
  blocklist: ["[-:,]"],
  theme: {
    extend: {
      // Graphite theme (values in src/style.css).
      colors: {
        bg: v("bg"),
        panel: v("panel"),
        panel2: v("panel2"),
        line: v("line"),
        ink: v("ink"),
        muted: v("muted"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
        sel: v("sel"),
        cell: v("cell"),
        oop: v("oop"),
        ip: v("ip"),
        "act-check": "#3fae6e",
        "act-bet1": "#e0704f",
        "act-bet2": "#c4473a",
        "act-bet3": "#9e2f2b",
        "act-fold": "#4f86c6",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
