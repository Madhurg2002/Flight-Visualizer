import { routeRows } from "@skytrace/data/routes.generated";
import { parseFlightInput, resolveFlight } from "@skytrace/flight-core/server";
import type { ResolveResult } from "@skytrace/types";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Resolve a half-remembered flight into ranked candidates.
 *
 * The whole route table is only ever loaded here, in the backend, so the 680KB
 * of reference data never reaches the browser.
 *
 * Development note: `convex dev` only watches this directory, so edits to
 * `packages/flight-core` do not trigger a re-push on their own. `bun run
 * dev:all` starts a small watcher that handles this automatically.
 */
export const resolve = query({
  args: { query: v.string() },
  handler: async (ctx, args): Promise<ResolveResult> => {
    const parsed = parseFlightInput(args.query);

    // Knowing where the user has already been makes the guesswork better, but
    // the resolver is useful signed out too — that is how the landing page
    // demonstrates it — so a missing user is not an error.
    const userId = await getAuthUserId(ctx);
    const visited = new Set<string>();
    if (userId) {
      const rows = await ctx.db
        .query("flights")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const row of rows) {
        visited.add(row.fromIata);
        visited.add(row.toIata);
      }
    }

    return resolveFlight(parsed, { routeRows, visitedIatas: visited });
  },
});
