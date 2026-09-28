import { getAirport, getAirline } from "@skytrace/data";
import { co2Kg, estimateDurationMin, haversineKm } from "@skytrace/flight-core";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { flights, trips, users } from "../db/schema.ts";
import { hashPassword } from "../server/password.ts";

/**
 * A demo account, so a deployed app has something to show.
 *
 * Render's free tier is the reason this exists. The service is disposable and
 * the database starts empty, so a fresh deployment is a working app with an
 * empty log: the map draws nothing, the stats tiles are all zero, and it is
 * impossible to tell a working deployment from a broken one without first
 * signing in and logging a flight by hand.
 *
 * Every value written here is derived rather than typed in: the distance,
 * duration and CO₂ come from the same functions the add-flight route uses, so
 * a seeded flight is indistinguishable from a real one and the totals on the
 * dashboard mean something. The coordinates come from the compiled dataset, so
 * an IATA code that does not exist fails loudly at boot instead of producing a
 * flight to nowhere.
 *
 * It is **additive and idempotent**: it does nothing at all if the account
 * already exists, so it is safe on every restart and will never touch a real
 * log. There is no update path and no delete path, deliberately — a seeder
 * that can overwrite is a seeder that can lose data.
 *
 * It runs from `start`, after `db:push`. The password is read from the
 * environment rather than committed: a demo account with a known password on a
 * public URL is an account anybody can sign in to. With no
 * `SEED_DEMO_PASSWORD` set, this exits quietly and says why.
 */

/** The flights to create. Distances and emissions are computed, not stored. */
const SEED_FLIGHTS: {
  date: string;
  from: string;
  to: string;
  airline: string;
  flightNumber: string;
  cabin: "economy" | "premium_economy" | "business" | "first";
  seat: string;
  costMinor: number | null;
  rating: number | null;
  notes: string | null;
}[] = [
  { date: "2024-02-11", from: "SFO", to: "JFK", airline: "UA", flightNumber: "2154", cabin: "economy", seat: "14A", costMinor: 41_200, rating: 4, notes: "Window over the Rockies on the way in." },
  { date: "2024-05-03", from: "JFK", to: "FCO", airline: "DL", flightNumber: "411", cabin: "premium_economy", seat: "22C", costMinor: 88_900, rating: 5, notes: "The overnight one. Landed before the coffee." },
  { date: "2024-05-11", from: "FCO", to: "JFK", airline: "DL", flightNumber: "412", cabin: "premium_economy", seat: "22D", costMinor: 0, rating: 3, notes: "Connection in Rome, then straight back." },
  { date: "2024-09-20", from: "JFK", to: "SFO", airline: "UA", flightNumber: "2153", cabin: "economy", seat: "15C", costMinor: 39_800, rating: 4, notes: null },
  { date: "2025-03-08", from: "SFO", to: "HND", airline: "NH", flightNumber: "7", cabin: "business", seat: "2A", costMinor: 412_000, rating: 5, notes: "Flat bed the whole way. Worth it exactly once." },
  { date: "2025-03-17", from: "HND", to: "SIN", airline: "SQ", flightNumber: "637", cabin: "economy", seat: "31K", costMinor: 46_500, rating: 4, notes: null },
  { date: "2025-03-24", from: "SIN", to: "HND", airline: "SQ", flightNumber: "638", cabin: "economy", seat: "31J", costMinor: 44_100, rating: 4, notes: null },
  { date: "2025-04-02", from: "HND", to: "SFO", airline: "NH", flightNumber: "8", cabin: "business", seat: "3C", costMinor: 0, rating: 5, notes: null },
];

const SEED_TRIP = { name: "Japan 2025", startDate: "2025-03-08", endDate: "2025-04-02" };

function fail(message: string): never {
  throw new Error(message);
}

export type SeedResult =
  | { created: false; reason: string }
  | { created: true; email: string; userId: string; tripId: string; flightCount: number; distanceKm: number };

/**
 * Create the demo account if it is not already there.
 *
 * Takes the database rather than reading `DATABASE_URL` itself, so the check
 * harness can run this against the Postgres inside the process. Returns what
 * it did instead of exiting, because a seeder that calls `process.exit` cannot
 * be called twice in one test run.
 */
export async function seedDemo(db: ReturnType<typeof getDb>, email: string, password: string): Promise<SeedResult> {
  if (password.length < 8) fail("the demo password must be at least 8 characters");

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return { created: false, reason: "account already exists" };

  // Every code is resolved before anything is written, so a typo in the table
  // above cannot leave half a demo account behind.
  const now = Date.now();
  const tripId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  const trip = { id: tripId, userId, name: SEED_TRIP.name, startDate: SEED_TRIP.startDate, endDate: SEED_TRIP.endDate, createdAt: now };
  const rows = SEED_FLIGHTS.map((f) => {
    const from = getAirport(f.from);
    const to = getAirport(f.to);
    if (!from || !to) fail(`unknown airport in the seed data: ${!from ? f.from : f.to}`);
    const distanceKm = Math.round(haversineKm(from, to));

    return {
      id: crypto.randomUUID(),
      userId,
      airlineCode: f.airline,
      airlineName: getAirline(f.airline)?.name ?? null,
      flightNumber: f.flightNumber,
      flightDate: f.date,
      fromIata: f.from,
      toIata: f.to,
      distanceKm,
      durationMin: estimateDurationMin(distanceKm),
      co2Kg: co2Kg(distanceKm, f.cabin),
      aircraft: null,
      tailNumber: null,
      cabin: f.cabin,
      seat: f.seat,
      costMinor: f.costMinor,
      currency: f.costMinor === null ? null : "USD",
      rating: f.rating,
      notes: f.notes,
      source: "manual" as const,
      tripId,
      loggedAt: now,
    };
  });

  await db.insert(users).values({ id: userId, email, passwordHash: await hashPassword(password), createdAt: now });
  await db.insert(trips).values(trip);
  await db.insert(flights).values(rows);

  return {
    created: true,
    email,
    userId,
    tripId,
    flightCount: rows.length,
    distanceKm: Math.round(rows.reduce((sum, r) => sum + r.distanceKm, 0)),
  };
}

if (import.meta.main) {
  const email = (process.env.SEED_DEMO_EMAIL ?? "demo@skytrace.app").trim().toLowerCase();
  const password = process.env.SEED_DEMO_PASSWORD;

  if (!process.env.DATABASE_URL) {
    console.log("[seed] DATABASE_URL is not set — skipping the demo data.");
  } else if (!password) {
    // Not an error. A deployment with no demo account is a perfectly good
    // deployment, and inventing a password here would put a credential for a
    // public URL into whatever the host records in its logs.
    console.log("[seed] SEED_DEMO_PASSWORD is not set — skipping the demo data.");
  } else {
    try {
      const result = await seedDemo(getDb(), email, password);
      if (!result.created) {
        console.log(`[seed] ${email} already exists — nothing to do.`);
      } else {
        console.log(
          `[seed] created ${email} with ${result.flightCount} flights and 1 trip ` +
            `(${result.distanceKm.toLocaleString("en")} km). Sign in with ` +
            "SEED_DEMO_EMAIL / SEED_DEMO_PASSWORD, and change the password there.",
        );
      }
    } catch (error) {
      // A seeder that takes the server down with it is worse than one that
      // does not run. `start` continues regardless.
      console.error(`[seed] skipped — ${(error as Error).message}`);
    }
  }
}
