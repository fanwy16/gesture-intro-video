import { defineConfig } from "vite";

// assets/ is served at the site root, so scenes.json paths read like the
// brief: "icons/figma.svg" is assets/icons/figma.svg.
export default defineConfig({
  publicDir: "assets",
  server: { port: 5173 },
});
