import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/** Identity for the header. Returns null rather than throwing when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user?.email ?? null;
  },
});
