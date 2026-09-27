import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const cabin = v.union(
  v.literal("economy"),
  v.literal("premium_economy"),
  v.literal("business"),
  v.literal("first"),
);

const source = v.union(v.literal("resolved"), v.literal("manual"), v.literal("imported"));

export default defineSchema({
  ...authTables,

  /**
   * A flight the user has taken.
   *
   * Distance, duration and CO2 are stored rather than derived because they are
   * snapshots: they must stay correct for a 2014 log entry even though the
   * reference data behind them moves on.
   */
  flights: defineTable({
    userId: v.id("users"),
    airlineCode: v.optional(v.string()),
    airlineName: v.optional(v.string()),
    flightNumber: v.optional(v.string()),
    /** ISO `yyyy-mm-dd`. Stored as a string so it is never shifted by a timezone. */
    flightDate: v.string(),
    fromIata: v.string(),
    toIata: v.string(),
    distanceKm: v.number(),
    durationMin: v.number(),
    co2Kg: v.number(),
    aircraft: v.optional(v.string()),
    tailNumber: v.optional(v.string()),
    cabin: v.optional(cabin),
    seat: v.optional(v.string()),
    /** Minor units (cents) to keep money out of binary floats. */
    costMinor: v.optional(v.number()),
    currency: v.optional(v.string()),
    rating: v.optional(v.number()),
    notes: v.optional(v.string()),
    source,
    tripId: v.optional(v.id("trips")),
    loggedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "flightDate"]),

  /** Groups legs into one journey, e.g. "Japan 2025". */
  trips: defineTable({
    userId: v.id("users"),
    name: v.string(),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
