import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = (name: string, file = "index.ts") =>
  fileURLToPath(new URL(`../common/${name}/src/${file}`, import.meta.url));

/**
 * Where the Convex backend lives, as seen from the sandbox.
 *
 * A local `convex dev` deployment only binds to 127.0.0.1, which is reachable
 * from the terminal but *not* from the user's browser — the browser talks to
 * the preview over HTTPS. So in development we proxy Convex's own paths through
 * the Vite server and point the browser at the page origin instead. That keeps
 * one code path in the app: it always connects to `window.location.origin`.
 *
 * The address itself belongs to the backend: `convex dev` picks a port, writes
 * it to the backend's own env file and keeps it in step. Reading that file
 * first means the two halves cannot drift apart — the classic failure being a
 * proxy aimed at a deployment that no longer exists, which looks exactly like
 * a broken backend. There is no such file in a deployed build, so hosting
 * falls through to the environment it provides.
 */
function readBackendEnv(key: string): string | undefined {
  const file = fileURLToPath(new URL("../backend/.env.local", import.meta.url));
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (match?.[1] === key) return match[2]!.replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const convexBackend =
  readBackendEnv("CONVEX_URL") ?? process.env.CONVEX_URL ?? "http://127.0.0.1:3210";

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
      { find: /^@convex\//, replacement: fileURLToPath(new URL("../backend/convex/", import.meta.url)) },
    ],
  },
  server: {
    // The preview port is injected by the platform; bind all interfaces so it
    // is reachable. HMR stays off — the platform reloads on its own schedule.
    host: "0.0.0.0",
    hmr: false,
    proxy: convexProxy,
    // The shared packages and the backend both live above the app root.
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
});
