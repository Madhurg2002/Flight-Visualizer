import { searchAirlines, searchAirports } from "@skytrace/data";
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Airport and airline lookup for the add-flight form.
 *
 * The dataset is ~1.9MB, so it can only be searched here. The client asks for
 * a prefix and gets back a handful of records with the fields the form needs —
 * which is enough to autocomplete without ever indexing the data in the
 * browser.
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

export const searchAirport = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    const limit = Math.min(12, Math.max(1, args.limit ?? 8));
    return searchAirports(args.query, limit).map(projectAirport);
  },
});

export const searchAirline = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    const limit = Math.min(12, Math.max(1, args.limit ?? 8));
    return searchAirlines(args.query, limit).map((airline) => ({
      iata: airline.iata,
      icao: airline.icao,
      name: airline.name,
      callsign: airline.callsign,
      country: airline.country,
      routes: airline.routes,
    }));
  },
});

/**
 * Confirm a single airport, used when the user types a bare code into the form
 * and the autocomplete is dismissed.
 */
export const lookupAirport = query({
  args: { iata: v.string() },
  handler: async (_ctx, args) => {
    const airport = searchAirports(args.iata, 1)[0];
    if (!airport) return null;
    return projectAirport(airport);
  },
});
