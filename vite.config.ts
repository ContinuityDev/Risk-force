import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/** GitHub Pages project site: https://continuitydev.github.io/Risk-force/ */
const BASE = "/Risk-force/";

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "sprites/**/*.{png,svg}",
      ],
      manifest: {
        id: BASE,
        name: "Risk Force",
        short_name: "Risk Force",
        description:
          "Near-future Earth war simulator — Risk-style map with base building and battles.",
        theme_color: "#0b1a14",
        background_color: "#070e18",
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        orientation: "landscape",
        start_url: BASE,
        scope: BASE,
        lang: "en",
        categories: ["games"],
        icons: [
          {
            src: `${BASE}icons/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${BASE}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${BASE}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Sprite pack is ~14MB; raise the default 2MB ceiling.
        maximumFileSizeToCacheInBytes: 18 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
});
