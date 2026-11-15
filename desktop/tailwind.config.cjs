/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["src/**/*.ts", "src/**/*.vue"],
  // `trimRegex` in src/utils.ts (/\s*([-:,])\s*/g) looks like the arbitrary
  // property class `[-:,]` to Tailwind's scanner and yields invalid CSS
  // (`-: ,;`), which Vite 8's CSS minifier rejects.
  blocklist: ["[-:,]"],
  plugins: [require("@tailwindcss/forms")],
};
