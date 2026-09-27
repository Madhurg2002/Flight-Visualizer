import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = (name: string, file = "index.ts") =>
  fileURLToPath(new URL(`../../packages/${name}/src/${file}`, import.meta.url));

/**
 * Where the Convex backend lives, as seen from the sandbox.
 *
 * A local `convex dev` deployment only binds to 127.0.0.1, which is reachable
 * from the terminal but *not* from the user's browser — the browser talks to
 * the preview over HTTPS. So in development we proxy Convex's own paths through
 * the Vite server and point the browser at the page origin instead. That keeps
 * one code path in the app: it always connects to `window.location.origin`.
 */
const convexBackend = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";

const convexProxy = {
  "/api": { target: convexBackend, changeOrigin: true, ws: true },
  "/.well-known": { target: convexBackend, changeOrigin: true, ws: true },
};

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
      { find: /^@convex\//, replacement: fileURLToPath(new URL("./convex/", import.meta.url)) },
    ],
  },
  server: {
    // The preview port is injected by the platform; bind all interfaces so it
    // is reachable. HMR stays off — the platform reloads on its own schedule.
    host: "0.0.0.0",
    hmr: false,
    proxy: convexProxy,
    // Shared packages live above the app root.
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
});
