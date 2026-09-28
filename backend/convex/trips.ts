import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const trips = await ctx.db
      .query("trips")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const flights = await ctx.db
      .query("flights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const counts = new Map<string, number>();
    for (const f of flights) {
      if (f.tripId) counts.set(f.tripId, (counts.get(f.tripId) ?? 0) + 1);
    }

    // Projected to the shared `Trip` shape rather than spreading the document,
    // so the optional `endDate` becomes an explicit null the UI can rely on.
    return trips
      .map((t) => ({
        id: t._id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate ?? null,
        createdAt: t.createdAt,
        flightCount: counts.get(t._id) ?? 0,
      }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
});

export const create = mutation({
  args: { name: v.string(), startDate: v.string(), endDate: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Id<"trips">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");

    const name = args.name.trim();
    if (name.length === 0) throw new Error("Trip name is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDate)) throw new Error("Invalid start date");

    return await ctx.db.insert("trips", {
      userId,
      name,
      startDate: args.startDate,
      ...(args.endDate ? { endDate: args.endDate } : {}),
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("trips") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");

    const trip = await ctx.db.get(args.id);
    if (!trip || trip.userId !== userId) throw new Error("Not found");

    // Flights survive losing their trip rather than being deleted with it.
    const flights = await ctx.db
      .query("flights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const f of flights) {
      if (f.tripId === args.id) await ctx.db.patch(f._id, { tripId: undefined });
    }

    await ctx.db.delete(args.id);
  },
});
