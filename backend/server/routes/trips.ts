import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.ts";
import { flights, trips } from "../../db/schema.ts";
import type { Trip } from "@skytrace/types";
import { UserError, isIsoDate, optStr, readJson, str } from "../http.ts";
import { requireUser, type Ctx } from "../session.ts";

/** Trips, ported from the Convex functions of the same name. */
export async function listTrips(ctx: Ctx): Promise<Trip[]> {
  if (!ctx.user) return [];

  const [tripRows, flightRows] = await Promise.all([
    getDb().query.trips.findMany({ where: eq(trips.userId, ctx.user.id) }),
    getDb()
      .select({ tripId: flights.tripId })
      .from(flights)
      .where(eq(flights.userId, ctx.user.id)),
  ]);

  const counts = new Map<string, number>();
  for (const f of flightRows) {
    if (f.tripId) counts.set(f.tripId, (counts.get(f.tripId) ?? 0) + 1);
  }

  return tripRows
    .map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate ?? null,
      createdAt: t.createdAt,
      flightCount: counts.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** Returns the new id, which the caller immediately applies as a filter. */
export async function createTrip(ctx: Ctx): Promise<string> {
  const user = requireUser(ctx);
  const body = await readJson<Record<string, unknown>>(ctx.req);

  const name = str(body.name, "name").trim();
  const startDate = str(body.startDate, "startDate");
  const endDate = optStr(body.endDate);

  if (name.length === 0) throw new UserError("Trip name is required");
  if (!isIsoDate(startDate)) throw new UserError("Invalid start date");
  if (endDate !== undefined && !isIsoDate(endDate)) throw new UserError("Invalid end date");

  const id = crypto.randomUUID();
  await getDb()
    .insert(trips)
    .values({ id, userId: user.id, name, startDate, ...(endDate ? { endDate } : {}), createdAt: Date.now() });

  return id;
}

export async function removeTrip(ctx: Ctx): Promise<void> {
  const user = requireUser(ctx);
  const body = await readJson<Record<string, unknown>>(ctx.req);
  const id = str(body.id, "id");

  const trip = await getDb().query.trips.findFirst({ where: eq(trips.id, id) });
  if (!trip || trip.userId !== user.id) throw new UserError("Not found", 404);

  // Flights survive losing their trip rather than being deleted with it. The
  // column is `on delete set null`, so detaching them is the same statement
  // either way — this makes the intent explicit rather than incidental.
  await getDb()
    .update(flights)
    .set({ tripId: null })
    .where(eq(flights.tripId, id));

  await getDb().delete(trips).where(eq(trips.id, id));
}
