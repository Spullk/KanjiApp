import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Served from https://<user>.github.io/<repo>/ on GitHub Pages.
  base: "./",
  json: { stringify: true },
  // The dictionary files are large on purpose; they load once and are cached offline.
  build: { chunkSizeWarningLimit: 6000 },
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Nekko",
        short_name: "Nekko",
        description: "Kanji and vocabulary, all connected",
        lang: "ja",
        theme_color: "#1f1b24",
        background_color: "#1f1b24",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The dictionary chunks are a few MB each; cache them so the app works offline.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,png}"],
      },
    }),
  ],
});
