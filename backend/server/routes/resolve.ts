import { eq } from "drizzle-orm";
import { routeRows } from "@skytrace/data/routes.generated";
import { searchAirlines, searchAirports } from "@skytrace/data";
import { parseFlightInput, resolveFlight } from "@skytrace/flight-core/server";
import type { ResolveResult } from "@skytrace/types";
import { getDb } from "../../db/client.ts";
import { flights } from "../../db/schema.ts";
import type { Ctx } from "../session.ts";

/**
 * Resolve a half-remembered flight into ranked candidates.
 *
 * The whole route table is only ever loaded here, on the server, so the ~850KB
 * of reference data never reaches the browser.
 */
export async function resolveQuery(ctx: Ctx): Promise<ResolveResult> {
  const parsed = parseFlightInput(ctx.url.searchParams.get("query") ?? "");

  // Knowing where the user has already been makes the guesswork better, but the
  // resolver is useful signed out too — that is how the landing page
  // demonstrates it — so a missing user is not an error.
  const visited = new Set<string>();
  if (ctx.user) {
    const rows = await getDb()
      .select({ fromIata: flights.fromIata, toIata: flights.toIata })
      .from(flights)
      .where(eq(flights.userId, ctx.user.id));
    for (const row of rows) {
      visited.add(row.fromIata);
      visited.add(row.toIata);
    }
  }

  return resolveFlight(parsed, { routeRows, visitedIatas: visited });
}

/**
 * Airport and airline lookup for the add-flight form.
 *
 * The dataset is ~1.9MB, so it can only be searched here. The client asks for a
 * prefix and gets back a handful of records with the fields the form needs —
 * which is enough to autocomplete without ever indexing the data in the browser.
 */

/** A trimmed projection: the form only needs identity and where it is. */
function projectAirport(airport: ReturnType<typeof searchAirports>[number]) {
  return {
    iata: airport.iata,
    icao: airport.icao,
    name: airport.name,
    city: airport.city,
    country: airport.country,
    lat: airport.lat,
    lon: airport.lon,
    routes: airport.routes,
  };
}

function limitOf(ctx: Ctx): number {
  const raw = ctx.url.searchParams.get("limit");
  if (raw === null) return 8;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(12, Math.max(1, Math.floor(parsed)));
}

export function searchAirport(ctx: Ctx) {
  const query = ctx.url.searchParams.get("query") ?? "";
  return searchAirports(query, limitOf(ctx)).map(projectAirport);
}

export function searchAirline(ctx: Ctx) {
  const query = ctx.url.searchParams.get("query") ?? "";
  return searchAirlines(query, limitOf(ctx)).map((airline) => ({
    iata: airline.iata,
    icao: airline.icao,
    name: airline.name,
    callsign: airline.callsign,
    country: airline.country,
    routes: airline.routes,
  }));
}

/**
 * Confirm a single airport, used when the user types a bare code into the form
 * and the autocomplete is dismissed.
 */
export function lookupAirport(ctx: Ctx) {
  const iata = ctx.url.searchParams.get("iata") ?? "";
  const airport = searchAirports(iata, 1)[0];
  if (!airport) return null;
  return projectAirport(airport);
}
