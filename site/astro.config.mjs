// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://postflop.mica.app",
  vite: { plugins: [tailwindcss()] },
});
