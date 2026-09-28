import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = (name: string, file = "index.ts") =>
  fileURLToPath(new URL(`../common/${name}/src/${file}`, import.meta.url));

/**
 * Where the API runs in development.
 *
 * The API is a separate process (`backend/server/dev.ts`) listening on its own
 * port, but the browser is only ever told about the page origin: the app calls
 * `/api/...` and the Vite dev server forwards it here. That is the same shape
 * as production, where a single origin serves the built app and the API
 * together, so the client has one code path and there is no
 * environment-specific base URL to get wrong.
 */
const apiTarget = process.env.API_ORIGIN ?? `http://127.0.0.1:${process.env.API_PORT ?? 3210}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The map stack is large and changes on its own schedule; splitting it out
    // keeps the app chunk small and makes a deploy that only touches app code
    // cheap to cache.
    rollupOptions: {
      output: {
        manualChunks: {
          // react-map-gl has no bare entry point; the MapLibre binding lives at
          // the /maplibre subpath.
          map: ["maplibre-gl", "@deck.gl/core", "@deck.gl/layers", "react-map-gl/maplibre"],
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  resolve: {
    alias: [
      { find: /^@skytrace\/data\/routes\.generated$/, replacement: pkg("data", "routes.generated.ts") },
      { find: /^@skytrace\/data$/, replacement: pkg("data") },
      { find: /^@skytrace\/flight-core\/server$/, replacement: pkg("flight-core", "server.ts") },
      { find: /^@skytrace\/flight-core$/, replacement: pkg("flight-core") },
      { find: /^@skytrace\/types$/, replacement: pkg("types") },
      { find: /^@skytrace\/ui$/, replacement: pkg("ui") },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  server: {
    // The preview port is injected by the platform; bind all interfaces so it
    // is reachable. HMR stays off — the platform reloads on its own schedule.
    host: "0.0.0.0",
    hmr: false,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
    // The shared packages and the API both live above the app root.
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
});
