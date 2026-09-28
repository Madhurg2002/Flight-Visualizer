import { getAirport, getAirline } from "@skytrace/data";
import { routeRows } from "@skytrace/data/routes.generated";
import { co2Kg, estimateDurationMin, haversineKm } from "@skytrace/flight-core";
import { parseFlightInput, resolveFlight } from "@skytrace/flight-core/server";
import type {
  FlightLog,
  FlightLogWithAirports,
  FlightStats,
  LongestFlight,
  RepeatedRoute,
} from "@skytrace/types";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

type FlightDoc = Doc<"flights">;

const optionalString = v.optional(v.string());

/**
 * One row of a bulk import.
 *
 * `text` is free text ("UA 1234 2025-03-14") and the explicit fields are
 * overrides for a spreadsheet column. A row that already knows both airports
 * skips the resolver entirely, which is what makes CSV import exact.
 */
const importRow = v.object({
  text: v.string(),
  fromIata: optionalString,
  toIata: optionalString,
  date: optionalString,
  airlineCode: optionalString,
  flightNumber: optionalString,
  seat: optionalString,
  aircraft: optionalString,
  cabin: v.optional(
    v.union(
      v.literal("economy"),
      v.literal("premium_economy"),
      v.literal("business"),
      v.literal("first"),
    ),
  ),
  costMinor: v.optional(v.number()),
  currency: optionalString,
  rating: v.optional(v.number()),
  notes: optionalString,
});

export type ImportStatus = "added" | "duplicate" | "unresolved" | "invalid";

export type ImportRowResult = {
  /** 1-based line number in the pasted text, for pointing at the bad line. */
  line: number;
  text: string;
  status: ImportStatus;
  /** Human-readable, shown verbatim in the preview. */
  message: string;
  flightId: string | null;
  fromIata: string | null;
  toIata: string | null;
  date: string | null;
  airlineName: string | null;
  distanceKm: number | null;
};

/** Attach airport coordinates and names so the map never has to re-join. */
function enrich(doc: FlightDoc): FlightLogWithAirports | null {
  const from = getAirport(doc.fromIata);
  const to = getAirport(doc.toIata);
  // Both are validated on write, so this is a guard against a data file change.
  if (!from || !to) return null;

  return {
    ...doc,
    id: doc._id,
    airlineCode: doc.airlineCode ?? null,
    airlineName: doc.airlineName ?? null,
    flightNumber: doc.flightNumber ?? null,
    aircraft: doc.aircraft ?? null,
    tailNumber: doc.tailNumber ?? null,
    cabin: doc.cabin ?? null,
    seat: doc.seat ?? null,
    costMinor: doc.costMinor ?? null,
    currency: doc.currency ?? null,
    rating: doc.rating ?? null,
    notes: doc.notes ?? null,
    tripId: doc.tripId ?? null,
    fromLat: from.lat,
    fromLon: from.lon,
    fromName: from.name,
    fromCity: from.city,
    toLat: to.lat,
    toLon: to.lon,
    toName: to.name,
    toCity: to.city,
    countryOfOrigin: from.country,
    countryOfDest: to.country,
  };
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<FlightLogWithAirports[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("flights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return rows
      .map(enrich)
      .filter((f): f is FlightLogWithAirports => f !== null)
      .sort((a, b) => b.flightDate.localeCompare(a.flightDate));
  },
});

export const get = query({
  args: { id: v.id("flights") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) return null;
    return enrich(doc);
  },
});

export const add = mutation({
  args: {
    fromIata: v.string(),
    toIata: v.string(),
    flightDate: v.string(),
    airlineCode: optionalString,
    airlineName: optionalString,
    flightNumber: optionalString,
    aircraft: optionalString,
    tailNumber: optionalString,
    cabin: v.optional(
      v.union(
        v.literal("economy"),
        v.literal("premium_economy"),
        v.literal("business"),
        v.literal("first"),
      ),
    ),
    seat: optionalString,
    costMinor: v.optional(v.number()),
    currency: optionalString,
    rating: v.optional(v.number()),
    notes: optionalString,
    tripId: v.optional(v.id("trips")),
    source: v.optional(v.union(v.literal("resolved"), v.literal("manual"), v.literal("imported"))),
    /** Lets the UI ask "you already logged this one — add anyway?". */
    allowDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"flights">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");

    const from = getAirport(args.fromIata);
    const to = getAirport(args.toIata);
    if (!from) throw new Error(`Unknown origin airport: ${args.fromIata}`);
    if (!to) throw new Error(`Unknown destination airport: ${args.toIata}`);
    if (from.iata === to.iata) throw new Error("Origin and destination are the same airport");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.flightDate)) {
      throw new Error("Date must be yyyy-mm-dd");
    }
    if (args.rating !== undefined && (args.rating < 1 || args.rating > 5)) {
      throw new Error("Rating must be between 1 and 5");
    }

    // The same flight can legitimately be logged twice (two seats, a round trip
    // on a through-flight), so this warns rather than blocks.
    if (!args.allowDuplicate) {
      const existing = await ctx.db
        .query("flights")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", userId).eq("flightDate", args.flightDate),
        )
        .collect();
      const clash = existing.find(
        (f) =>
          f.fromIata === from.iata &&
          f.toIata === to.iata &&
          (f.flightNumber ?? null) === (args.flightNumber ?? null) &&
          (f.airlineCode ?? null) === (args.airlineCode ?? null),
      );
      if (clash) {
        throw new Error(
          `ALREADY_LOGGED:${clash._id.toString()}`,
        );
      }
    }

    if (args.tripId) {
      const trip = await ctx.db.get(args.tripId);
      if (!trip || trip.userId !== userId) throw new Error("Unknown trip");
    }

    const distanceKm = Math.round(haversineKm(from, to));

    return await ctx.db.insert("flights", {
      userId,
      fromIata: from.iata,
      toIata: to.iata,
      flightDate: args.flightDate,
      distanceKm,
      durationMin: estimateDurationMin(distanceKm),
      co2Kg: co2Kg(distanceKm, args.cabin ?? null),
      source: args.source ?? "manual",
      loggedAt: Date.now(),
      ...(args.airlineCode !== undefined ? { airlineCode: args.airlineCode.toUpperCase() } : {}),
      ...(args.airlineName !== undefined ? { airlineName: args.airlineName } : {}),
      ...(args.flightNumber !== undefined ? { flightNumber: args.flightNumber.toUpperCase() } : {}),
      ...(args.aircraft !== undefined ? { aircraft: args.aircraft } : {}),
      ...(args.tailNumber !== undefined ? { tailNumber: args.tailNumber.toUpperCase() } : {}),
      ...(args.cabin !== undefined ? { cabin: args.cabin } : {}),
      ...(args.seat !== undefined ? { seat: args.seat } : {}),
      ...(args.costMinor !== undefined ? { costMinor: args.costMinor } : {}),
      ...(args.currency !== undefined ? { currency: args.currency.toUpperCase() } : {}),
      ...(args.rating !== undefined ? { rating: args.rating } : {}),
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.tripId !== undefined ? { tripId: args.tripId } : {}),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("flights"),
    notes: v.optional(v.string()),
    seat: optionalString,
    aircraft: optionalString,
    tailNumber: optionalString,
    cabin: v.optional(
      v.union(
        v.literal("economy"),
        v.literal("premium_economy"),
        v.literal("business"),
        v.literal("first"),
      ),
    ),
    rating: v.optional(v.union(v.number(), v.null())),
    costMinor: v.optional(v.number()),
    currency: optionalString,
    tripId: v.optional(v.union(v.id("trips"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Not found");
    if (args.rating !== undefined && args.rating !== null && (args.rating < 1 || args.rating > 5)) {
      throw new Error("Rating must be between 1 and 5");
    }
    if (args.tripId !== null && args.tripId !== undefined) {
      const trip = await ctx.db.get(args.tripId);
      if (!trip || trip.userId !== userId) throw new Error("Unknown trip");
    }

    // Cabin changes the CO2 figure, so keep the two consistent.
    const co2KgNext =
      args.cabin !== undefined && args.cabin !== doc.cabin
        ? co2Kg(doc.distanceKm, args.cabin)
        : doc.co2Kg;

    await ctx.db.patch(args.id, {
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.seat !== undefined ? { seat: args.seat } : {}),
      ...(args.aircraft !== undefined ? { aircraft: args.aircraft } : {}),
      ...(args.tailNumber !== undefined ? { tailNumber: args.tailNumber.toUpperCase() } : {}),
      ...(args.cabin !== undefined ? { cabin: args.cabin } : {}),
      // Patching with `undefined` removes the field, which is how a rating is
      // cleared; passing `null` straight through would not typecheck.
      ...(args.rating !== undefined ? { rating: args.rating ?? undefined } : {}),
      ...(args.costMinor !== undefined ? { costMinor: args.costMinor } : {}),
      ...(args.currency !== undefined ? { currency: args.currency.toUpperCase() } : {}),
      ...(args.tripId !== undefined ? { tripId: args.tripId ?? undefined } : {}),
      ...(args.cabin !== undefined ? { co2Kg: co2KgNext } : {}),
    });
  },
});

/**
 * Import many flights at once.
 *
 * A real log is hundreds of flights and nobody clicks Add hundreds of times,
 * so this resolves every line in one call. It is deliberately a mutation and
 * not a loop of `add` calls: one round trip, and one place that can report
 * "line 42 did not resolve" without the UI having to reconstruct it.
 *
 * Nothing is thrown away silently. A line that cannot be resolved or has no
 * date comes back as a result row explaining why, and every other line still
 * lands.
 */
export const importBulk = mutation({
  args: { rows: v.array(importRow), tripId: v.optional(v.id("trips")) },
  handler: async (ctx, args): Promise<ImportRowResult[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    if (args.rows.length > 1000) throw new Error("Import at most 1000 rows at a time");

    if (args.tripId) {
      const trip = await ctx.db.get(args.tripId);
      if (!trip || trip.userId !== userId) throw new Error("Unknown trip");
    }

    const existing = await ctx.db
      .query("flights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // The resolver ranks better when it knows where the user has been.
    const visitedIatas = new Set<string>();
    // Duplicates are matched on the same tuple the single-add path uses, and the
    // set is updated as rows land so a repeated line inside one paste is caught
    // too, not just against what was already in the log.
    const seen = new Set<string>();
    for (const row of existing) {
      visitedIatas.add(row.fromIata);
      visitedIatas.add(row.toIata);
      seen.add(duplicateKeyOf(row.fromIata, row.toIata, row.flightDate, row.airlineCode, row.flightNumber));
    }

    const results: ImportRowResult[] = [];
    let line = 0;

    for (const row of args.rows) {
      line += 1;
      const text = row.text.trim();
      const base: ImportRowResult = {
        line,
        text,
        status: "invalid",
        message: "",
        flightId: null,
        fromIata: null,
        toIata: null,
        date: null,
        airlineName: null,
        distanceKm: null,
      };

      if (text === "" && !row.fromIata && !row.toIata) {
        results.push({ ...base, message: "Empty line." });
        continue;
      }

      // A row that names both airports is taken at face value; running the
      // resolver over "SFO, JFK, 2025-03-14" would only risk second-guessing a
      // spreadsheet.
      let fromIata = row.fromIata?.toUpperCase() ?? null;
      let toIata = row.toIata?.toUpperCase() ?? null;
      let date = row.date ?? null;
      let airlineCode = row.airlineCode?.toUpperCase() ?? null;
      let flightNumber = row.flightNumber?.toUpperCase() ?? null;
      let airlineName = airlineCode ? getAirline(airlineCode)?.name ?? null : null;
      let reason: string | null = null;

      if (fromIata && toIata) {
        const from = getAirport(fromIata);
        const to = getAirport(toIata);
        if (!from) {
          results.push({ ...base, fromIata, toIata, message: `Unknown origin airport: ${fromIata}.` });
          continue;
        }
        if (!to) {
          results.push({ ...base, fromIata, toIata, message: `Unknown destination airport: ${toIata}.` });
          continue;
        }
        fromIata = from.iata;
        toIata = to.iata;
      } else {
        const parsed = parseFlightInput(text);
        const resolution = resolveFlight(parsed, { routeRows, visitedIatas });
        const best = resolution.candidates[0] ?? null;

        // Below `high` the single-add flow asks the user to choose. In a bulk
        // paste there is nobody to ask, so the line is reported rather than
        // guessed at.
        if (!best || (best.confidence !== "exact" && best.confidence !== "high")) {
          results.push({
            ...base,
            message: best
              ? `Not confident enough to import: ${best.reason}`
              : "Could not work out which flight this is. Use codes like SFO → JFK.",
            fromIata: best?.fromIata ?? null,
            toIata: best?.toIata ?? null,
            airlineName: best?.airlineName ?? null,
            status: "unresolved",
          });
          continue;
        }

        fromIata = best.fromIata;
        toIata = best.toIata;
        airlineCode = airlineCode ?? best.airlineCode;
        flightNumber = flightNumber ?? best.flightNumber;
        airlineName = best.airlineName;
        date = date ?? best.date;
        reason = best.reason;
      }

      if (!date) {
        results.push({
          ...base,
          fromIata,
          toIata,
          airlineName,
          message: "No date. Add one, e.g. 2025-03-14.",
        });
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        results.push({ ...base, fromIata, toIata, message: `Date must be yyyy-mm-dd, got "${date}".` });
        continue;
      }

      const key = duplicateKeyOf(fromIata, toIata, date, airlineCode, flightNumber);
      if (seen.has(key)) {
        results.push({
          ...base,
          status: "duplicate",
          fromIata,
          toIata,
          date,
          airlineName,
          message: "Already in your log — skipped.",
        });
        continue;
      }
      seen.add(key);

      const from = getAirport(fromIata)!;
      const to = getAirport(toIata)!;
      const distanceKm = Math.round(haversineKm(from, to));

      const id = await ctx.db.insert("flights", {
        userId,
        fromIata: from.iata,
        toIata: to.iata,
        flightDate: date,
        distanceKm,
        durationMin: estimateDurationMin(distanceKm),
        co2Kg: co2Kg(distanceKm, row.cabin ?? null),
        source: "imported",
        loggedAt: Date.now(),
        ...(airlineCode !== null ? { airlineCode } : {}),
        ...(airlineName !== null ? { airlineName } : {}),
        ...(flightNumber !== null ? { flightNumber } : {}),
        ...(row.aircraft !== undefined ? { aircraft: row.aircraft } : {}),
        ...(row.seat !== undefined ? { seat: row.seat.toUpperCase() } : {}),
        ...(row.cabin !== undefined ? { cabin: row.cabin } : {}),
        ...(row.costMinor !== undefined ? { costMinor: Math.round(row.costMinor) } : {}),
        ...(row.currency !== undefined ? { currency: row.currency.toUpperCase() } : {}),
        ...(row.rating !== undefined && row.rating >= 1 && row.rating <= 5
          ? { rating: Math.round(row.rating) }
          : {}),
        ...(row.notes !== undefined ? { notes: row.notes } : {}),
        ...(args.tripId !== undefined ? { tripId: args.tripId } : {}),
      });

      results.push({
        ...base,
        status: "added",
        flightId: id.toString(),
        fromIata: from.iata,
        toIata: to.iata,
        date,
        airlineName,
        distanceKm,
        message: reason
          ? `${from.iata} → ${to.iata} · ${reason}`
          : `${from.iata} → ${to.iata}`,
      });
    }

    return results;
  },
});

/** The tuple the single-add duplicate check uses, in one place. */
function duplicateKeyOf(
  fromIata: string,
  toIata: string,
  flightDate: string,
  airlineCode: string | null | undefined,
  flightNumber: string | null | undefined,
): string {
  return [fromIata, toIata, flightDate, airlineCode ?? "", flightNumber ?? ""].join("|");
}

export const remove = mutation({
  args: { id: v.id("flights") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.id);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx): Promise<FlightStats | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const rows = await ctx.db
      .query("flights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const airports = new Set<string>();
    const countries = new Set<string>();
    const airlines = new Map<string, { code: string | null; name: string | null; count: number }>();
    const years = new Map<string, { count: number; distanceKm: number }>();
    // Directions are normalised, so JFK→LHR and LHR→JFK count as one route:
    // "you have flown this four times" means four times between two places.
    const routes = new Map<string, { count: number; distanceKm: number; dates: string[] }>();
    const arrivalsByCountry = new Map<string, number>();
    const spendByYear = new Map<string, number>();
    const currencies = new Map<string, number>();

    let totalDistanceKm = 0;
    let totalDurationMin = 0;
    let totalCo2Kg = 0;
    let longestFlightKm = 0;
    let shortestFlightKm = Number.POSITIVE_INFINITY;
    let longest: FlightDoc | null = null;
    let shortest: FlightDoc | null = null;
    let totalSpendMinor = 0;
    let pricedDistanceKm = 0;
    let pricedFlightCount = 0;

    for (const row of rows) {
      airports.add(row.fromIata);
      airports.add(row.toIata);
      for (const code of [row.fromIata, row.toIata]) {
        const airport = getAirport(code);
        if (airport) countries.add(airport.country);
      }

      const destination = getAirport(row.toIata);
      if (destination) {
        arrivalsByCountry.set(
          destination.country,
          (arrivalsByCountry.get(destination.country) ?? 0) + 1,
        );
      }

      totalDistanceKm += row.distanceKm;
      totalDurationMin += row.durationMin;
      totalCo2Kg += row.co2Kg;
      if (row.distanceKm > longestFlightKm) {
        longestFlightKm = row.distanceKm;
        longest = row;
      }
      if (row.distanceKm < shortestFlightKm) {
        shortestFlightKm = row.distanceKm;
        shortest = row;
      }

      const routeKey = routeKeyOf(row.fromIata, row.toIata);
      const route = routes.get(routeKey);
      if (route) {
        route.count += 1;
        route.distanceKm += row.distanceKm;
        route.dates.push(row.flightDate);
      } else {
        routes.set(routeKey, {
          count: 1,
          distanceKm: row.distanceKm,
          dates: [row.flightDate],
        });
      }

      if (row.costMinor !== undefined) {
        totalSpendMinor += row.costMinor;
        pricedDistanceKm += row.distanceKm;
        pricedFlightCount += 1;
        const year = row.flightDate.slice(0, 4);
        spendByYear.set(year, (spendByYear.get(year) ?? 0) + row.costMinor);
        const currency = row.currency ?? "USD";
        currencies.set(currency, (currencies.get(currency) ?? 0) + 1);
      }

      const airlineKey = row.airlineCode ?? "unknown";
      const existing = airlines.get(airlineKey);
      if (existing) existing.count += 1;
      else {
        airlines.set(airlineKey, {
          code: row.airlineCode ?? null,
          name: row.airlineName ?? getAirline(row.airlineCode)?.name ?? null,
          count: 1,
        });
      }

      const year = row.flightDate.slice(0, 4);
      const yearRow = years.get(year);
      if (yearRow) {
        yearRow.count += 1;
        yearRow.distanceKm += row.distanceKm;
      } else {
        years.set(year, { count: 1, distanceKm: row.distanceKm });
      }
    }

    const repeatedRoutes: RepeatedRoute[] = [...routes.entries()]
      .filter(([, route]) => route.count > 1)
      .map(([key, route]) => {
        const [fromIata, toIata] = key.split("|") as [string, string];
        const dates = [...route.dates].sort();
        return {
          fromIata,
          toIata,
          count: route.count,
          distanceKm: Math.round(route.distanceKm),
          firstDate: dates[0]!,
          lastDate: dates[dates.length - 1]!,
        };
      })
      .sort((a, b) => b.count - a.count || b.distanceKm - a.distanceKm);

    const topCountry = [...arrivalsByCountry.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      flightCount: rows.length,
      airlineCount: airlines.has("unknown") ? airlines.size - 1 : airlines.size,
      airportCount: airports.size,
      countryCount: countries.size,
      totalDistanceKm: Math.round(totalDistanceKm),
      totalDurationMin: Math.round(totalDurationMin),
      totalCo2Kg: Math.round(totalCo2Kg),
      longestFlightKm: Math.round(longestFlightKm),
      longestFlight: longest ? describeFlight(longest) : null,
      shortestFlight: shortest && shortestFlightKm < Number.POSITIVE_INFINITY
        ? describeFlight(shortest)
        : null,
      flightsByYear: [...years.entries()]
        .map(([year, v]) => ({ year, count: v.count, distanceKm: Math.round(v.distanceKm) }))
        .sort((a, b) => a.year.localeCompare(b.year)),
      topAirlines: [...airlines.values()].sort((a, b) => b.count - a.count).slice(0, 6),
      repeatedRoutes: repeatedRoutes.slice(0, 5),
      repeatFlightCount: repeatedRoutes.reduce((sum, r) => sum + r.count, 0),
      totalSpendMinor,
      spendCurrency: [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      // Money is summed in minor units, so this ratio is still exact-ish: the
      // rounding only happens once, at the end.
      costPerKmMinor: pricedDistanceKm > 0
        ? Number(((totalSpendMinor / pricedDistanceKm) * 100).toFixed(2))
        : null,
      pricedFlightCount,
      spendByYear: [...spendByYear.entries()]
        .map(([year, minor]) => ({ year, minor }))
        .sort((a, b) => a.year.localeCompare(b.year)),
      mostVisitedCountry: topCountry ? { country: topCountry[0], arrivals: topCountry[1] } : null,
    };
  },
});

/** A direction-independent key, so a return leg joins its outbound. */
function routeKeyOf(fromIata: string, toIata: string): string {
  return fromIata < toIata ? `${fromIata}|${toIata}` : `${toIata}|${fromIata}`;
}

/** Enough of a stored flight for a "records" row to render and link to it. */
function describeFlight(doc: FlightDoc): LongestFlight {
  const from = getAirport(doc.fromIata);
  const to = getAirport(doc.toIata);
  return {
    id: doc._id.toString(),
    fromIata: doc.fromIata,
    toIata: doc.toIata,
    fromCity: from?.city ?? doc.fromIata,
    toCity: to?.city ?? doc.toIata,
    flightDate: doc.flightDate,
    distanceKm: Math.round(doc.distanceKm),
    durationMin: Math.round(doc.durationMin),
  };
}

export type { FlightLog };
