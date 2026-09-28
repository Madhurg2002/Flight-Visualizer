import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The Postgres schema, replacing the Convex one this app used to run on.
 *
 * The shape is deliberately identical to the old `schema.ts`: same columns, same
 * optionality, same units. The domain types in `@skytrace/types` were already
 * written with plain `string` ids and explicit nulls, so the app code did not
 * have to change when the storage engine did.
 *
 * Two deliberate departures from Convex:
 *
 * - Ids are `text` generated in the app (`crypto.randomUUID`). Convex ids are
 *   opaque strings too, so the client cannot tell the difference, and this keeps
 *   inserts explicit rather than relying on a `gen_random_uuid()` default.
 * - `flight_date` / `start_date` / `end_date` are real `date` columns, which
 *   Postgres returns as `yyyy-mm-dd` with no timezone attached. That is exactly
 *   the guarantee the old schema asked for in a comment.
 */

export const cabinEnum = pgEnum("cabin", ["economy", "premium_economy", "business", "first"]);

export const flightSourceEnum = pgEnum("flight_source", ["resolved", "manual", "imported"]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    /** `scrypt$N$r$p$salt$hash` — see `server/password.ts`. */
    passwordHash: text("password_hash").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // Case-insensitive: "Ada@example.com" and "ada@example.com" are one account,
    // otherwise a duplicate row would be created and the second sign-in would
    // silently fail against the first row the index returned.
    uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /**
     * The SHA-256 of the session token, never the token itself. A leaked database
     * dump would otherwise hand out live sessions.
     */
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Epoch milliseconds, matching every other timestamp in this schema. */
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Groups legs into one journey, e.g. "Japan 2025". */
export const trips = pgTable(
  "trips",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("trips_user_idx").on(t.userId)],
);

/**
 * A flight the user has taken.
 *
 * Distance, duration and CO2 are stored rather than derived because they are
 * snapshots: they must stay correct for a 2014 log entry even though the
 * reference data behind them moves on.
 */
export const flights = pgTable(
  "flights",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    airlineCode: text("airline_code"),
    airlineName: text("airline_name"),
    flightNumber: text("flight_number"),
    flightDate: date("flight_date", { mode: "string" }).notNull(),
    fromIata: text("from_iata").notNull(),
    toIata: text("to_iata").notNull(),
    /** Real, not integer: the stored value is already rounded to a whole km. */
    distanceKm: real("distance_km").notNull(),
    durationMin: real("duration_min").notNull(),
    co2Kg: real("co2_kg").notNull(),
    aircraft: text("aircraft"),
    tailNumber: text("tail_number"),
    cabin: cabinEnum("cabin"),
    seat: text("seat"),
    /** Minor units (cents) to keep money out of binary floats. */
    costMinor: integer("cost_minor"),
    currency: text("currency"),
    rating: integer("rating"),
    notes: text("notes"),
    source: flightSourceEnum("source").notNull(),
    tripId: text("trip_id").references(() => trips.id, { onDelete: "set null" }),
    loggedAt: bigint("logged_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("flights_user_idx").on(t.userId),
    // The duplicate check on add filters user + date, then compares the
    // airports in JS. This is the index that makes that check cheap.
    index("flights_user_date_idx").on(t.userId, t.flightDate),
    // Deleting a trip nulls the legs that pointed at it.
    index("flights_trip_idx").on(t.tripId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type TripRow = typeof trips.$inferSelect;
export type FlightRow = typeof flights.$inferSelect;
export type NewFlightRow = typeof flights.$inferInsert;
export type NewTripRow = typeof trips.$inferInsert;
