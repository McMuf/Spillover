import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Relative base + hash routing: the built site works from any path (GitHub Pages project site,
// a local preview, or a file server) with no server rewrite rules.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  define: {
    __COMMIT__: JSON.stringify((process.env.GITHUB_SHA ?? "dev").slice(0, 7)),
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
