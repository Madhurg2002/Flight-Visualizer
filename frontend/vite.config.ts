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
        // The map has to be genuinely unreachable until something imports it.
        //
        // It was not. `FlightMap` has always been behind `React.lazy`, but
        // Vite's own dynamic-import helper was being folded into the 1.9MB map
        // chunk, so the entry chunk carried a *static* import of it, index.html
        // carried a `modulepreload` for it, and every page — the landing page
        // included — pulled the whole map stack at high priority before it had
        // painted anything. The bundler was quietly undoing the lazy import.
        //
        // Function form rather than the object form, because the object form is
        // a blunt prefix match over module ids and matching on the resolved
        // path states exactly which packages are the map.
        manualChunks(id: string) {
          // Vite injects these two virtual modules to implement `import()` with
          // dependency preloading. Left to Rollup's own placement they end up
          // folded into whichever chunk is being built alongside them — here,
          // the 1.9MB map chunk — which the entry then has to import
          // statically, and the whole point of a lazy chunk evaporates. Naming
          // them puts a 1KB chunk where it belongs: imported by the entry,
          // preloaded, harmless.
          if (id.startsWith("\0vite/")) return "vite-preload";
          if (
            /[\\/]node_modules[\\/](maplibre-gl|react-map-gl|@deck\.gl|@luma\.gl|@math\.gl|@loaders\.gl|@probe\.gl)[\\/]/.test(
              id,
            )
          ) {
            return "map";
          }
          // react-map-gl has no bare entry point; the MapLibre binding lives at
          // the /maplibre subpath, which the pattern above already catches.
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
              id,
            )
          ) {
            return "react";
          }
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
