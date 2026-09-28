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
import { readFileSync, statSync, utimesSync } from "node:fs";
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
    // Node's recursive watch documents the filename as "may not be provided",
    // and it has been observed arriving as undefined rather than null. The
    // generated-file guard below keys on a string, so a missing filename would
    // slip past it and push a half-written 1.2MB dataset to the deployment.
    // Treat "we cannot name the file" as "something here changed" and nudge
    // anyway: serving stale resolver code is the worse of the two failures.
    if (typeof filename !== "string") {
      console.log(`[watch-packages] ${dir} changed (filename not reported) — re-pushing Convex`);
      nudge();
      return;
    }
    if (filename.endsWith(".generated.ts")) {
      // Regenerated datasets are megabytes; the Convex bundle will pick them
      // up on the next edit, and pushing mid-write risks a broken deploy.
      console.log("[watch-packages] dataset regenerated; re-push on the next edit");
      return;
    }
    console.log(`[watch-packages] ${dir}/${filename} changed — re-pushing Convex`);
    nudge();
  });
  watching++;
}

if (watching > 0) {
  console.log(`[watch-packages] watching ${watching} package director${watching === 1 ? "y" : "ies"}`);
}

/**
 * Exit when the process that started us goes away.
 *
 * Without this, every dev-server restart leaves another watcher behind —
 * they are cheap individually, but they accumulate until the machine is
 * short of memory, and nothing reaps them because the preview runner only
 * reclaims the port it owns.
 *
 * Checking `process.ppid` is not enough: we are started as `bun run
 * scripts/watch-packages.ts`, and that wrapper outlives its own parent, so
 * our immediate parent id never changes. What actually happens is that
 * *some* ancestor exits and we are reparented. So the whole chain is
 * recorded at startup and re-checked; if any of those processes is gone,
 * the run is over.
 */
function ancestorChain(): number[] {
  const chain: number[] = [];
  let pid = process.pid;
  // /proc gives the real parent even when the parent has already exited and
  // this process has been reparented, which is exactly the case we detect.
  for (let depth = 0; depth < 16 && pid > 1; depth++) {
    let ppid = 0;
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      // The comm field is parenthesised and may contain spaces, so parse from
      // the last ')' rather than splitting the whole line.
      ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    } catch {
      break;
    }
    if (!ppid || chain.includes(ppid)) break;
    chain.push(ppid);
    pid = ppid;
  }
  return chain;
}

const startingChain = ancestorChain().join(",");

if (startingChain) {
  setInterval(() => {
    // The shape of the chain is the signal, not any one pid: when an ancestor
    // exits we are reparented and the chain changes. Testing for a recorded
    // pid disappearing would miss the common case, because the short-lived
    // process in the middle has usually exited before this script even runs.
    if (ancestorChain().join(",") !== startingChain) {
      console.log("[watch-packages] reparented — the run that started us has ended");
      process.exit(0);
    }
  }, 2000);
}
