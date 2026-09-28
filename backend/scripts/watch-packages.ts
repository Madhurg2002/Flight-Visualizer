/**
 * Nudges the Convex dev watcher when a shared package changes.
 *
 * `convex dev` only watches its own functions directory (`backend/convex`).
 * The resolver lives in `common/flight-core`, so editing it produces no
 * re-push and the deployment quietly serves stale code — the app still works,
 * it is just running the previous version of the logic. That is a genuinely
 * nasty failure mode to debug.
 *
 * This watches the shared packages and touches a file inside the functions
 * directory on change, which is enough to trigger a re-bundle. Convex
 * re-resolves the whole import graph, so the current package sources are what
 * gets pushed.
 *
 * Run alongside `convex dev` via `bun run dev:all`.
 */
import { watch } from "node:fs";
import { statSync, utimesSync } from "node:fs";
import { resolve } from "node:path";

// This file lives in backend/scripts, so the repo root is two levels up.
const PACKAGE_DIRS = [
  "../../common/types/src",
  "../../common/flight-core/src",
  "../../common/data/src",
];

/**
 * Touching a file that is already imported keeps the change trivial for the
 * bundler — it re-runs, but nothing in the diff is meaningful.
 */
const NUDGE_TARGET = resolve(import.meta.dir, "../convex/resolve.ts");

const DEBOUNCE_MS = 120;

let timer: ReturnType<typeof setTimeout> | undefined;

function nudge() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      const now = new Date();
      utimesSync(NUDGE_TARGET, now, now);
    } catch (error) {
      console.error("[watch-packages] could not touch", NUDGE_TARGET, error);
    }
  }, DEBOUNCE_MS);
}

let watching = 0;

for (const dir of PACKAGE_DIRS) {
  const absolute = resolve(import.meta.dir, dir);
  try {
    statSync(absolute);
  } catch {
    console.warn(`[watch-packages] skipping missing ${absolute}`);
    continue;
  }
  watch(absolute, { recursive: true }, (_event, filename) => {
    if (typeof filename === "string" && filename.endsWith(".generated.ts")) {
      // Regenerated datasets are megabytes; the Convex bundle will pick them
      // up on the next edit, and pushing mid-write risks a broken deploy.
      console.log("[watch-packages] dataset regenerated; re-push on the next edit");
      return;
    }
    console.log(`[watch-packages] ${dir}/${String(filename)} changed — re-pushing Convex`);
    nudge();
  });
  watching++;
}

if (watching > 0) {
  console.log(`[watch-packages] watching ${watching} package director${watching === 1 ? "y" : "ies"}`);
}
