import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// A Content-Security-Policy for the production build only (the dev server needs inline scripts
// for hot reload). The site is static and runs only its own scripts; no outside script runs in this
// page. Outside origins: giscus.app for discussion threads (a framed comment box, and the bundled
// widget's sign-in exchange), api.gdeltproject.org for live headlines, and news images from any https
// site, because each headline's preview image loads from its own publisher.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // charts and React set inline style attributes
  "img-src 'self' data: https:", // news preview images load live from each publisher's own site
  "font-src 'self'", // the Inter font is bundled and served from this site, never a CDN
  "connect-src 'self' https://giscus.app https://api.gdeltproject.org",
  "frame-src https://giscus.app",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Relative base + hash routing: the built site works from any path (GitHub Pages project site,
// a local preview, or a file server) with no server rewrite rules.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "inject-csp",
      apply: "build",
      transformIndexHtml: (html: string) =>
        html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  ],
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
