import { and, desc, eq } from "drizzle-orm";
import { getAirport, getAirline } from "@skytrace/data";
import { co2Kg, estimateDurationMin, haversineKm } from "@skytrace/flight-core";
import { parseFlightInput, resolveFlight } from "@skytrace/flight-core/server";
import { routeRows } from "@skytrace/data/routes.generated";
import type {
  Cabin,
  FlightLog,
  FlightLogWithAirports,
  FlightSource,
  FlightStats,
  ImportRowInput,
  ImportRowResult,
  LongestFlight,
  RepeatedRoute,
} from "@skytrace/types";
import { getDb } from "../../db/client.ts";
import { flights, trips, type FlightRow, type NewFlightRow } from "../../db/schema.ts";
import { UserError, isIsoDate, optNum, optStr, readJson, str } from "../http.ts";
import { requireUser, type Ctx } from "../session.ts";

/**
 * Every flight route, ported from the Convex functions of the same name.
 *
 * The validation order, error messages and duplicate rule are preserved exactly,
 * because the UI branches on them: `add` signals a duplicate with the message
 * `ALREADY_LOGGED:<id>` so the form can offer "add it anyway", and `importBulk`
 * reports per-line problems rather than failing the whole paste.
 */

const CABINS: readonly Cabin[] = ["economy", "premium_economy", "business", "first"];
const SOURCES: readonly FlightSource[] = ["resolved", "manual", "imported"];

function optCabin(value: unknown): Cabin | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !CABINS.includes(value as Cabin)) {
    throw new UserError("Unknown cabin");
  }
  return value as Cabin;
}

function optSource(value: unknown): FlightSource | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !SOURCES.includes(value as FlightSource)) {
    throw new UserError("Unknown source");
  }
  return value as FlightSource;
}

/** Attach airport coordinates and names so the map never has to re-join. */
export function enrich(doc: FlightRow): FlightLogWithAirports | null {
  const from = getAirport(doc.fromIata);
  const to = getAirport(doc.toIata);
  // Both are validated on write, so this is a guard against a data file change.
  if (!from || !to) return null;

  return {
    ...doc,
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

/** A direction-independent key, so a return leg joins its outbound. */
function routeKeyOf(fromIata: string, toIata: string): string {
  return fromIata < toIata ? `${fromIata}|${toIata}` : `${toIata}|${fromIata}`;
}

async function ownTrip(ctx: Ctx, tripId: string): Promise<void> {
  const trip = await getDb().query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip || trip.userId !== ctx.user!.id) throw new UserError("Unknown trip");
}

export async function listFlights(ctx: Ctx): Promise<FlightLogWithAirports[]> {
  if (!ctx.user) return [];

  const rows = await getDb().query.flights.findMany({
    where: eq(flights.userId, ctx.user.id),
    orderBy: [desc(flights.flightDate)],
  });

  return rows
    .map(enrich)
    .filter((f): f is FlightLogWithAirports => f !== null)
    .sort((a, b) => b.flightDate.localeCompare(a.flightDate));
}

export async function getFlight(ctx: Ctx, id: string): Promise<FlightLogWithAirports | null> {
  if (!ctx.user) return null;
  const doc = await getDb().query.flights.findFirst({
    where: (f, { and: a, eq: e }) => a(e(f.id, id), e(f.userId, ctx.user!.id)),
  });
  if (!doc) return null;
  return enrich(doc);
}

/** The `GET /flights/get?id=…` wrapper: arguments arrive in the query string. */
export function getFlightByQuery(ctx: Ctx): Promise<FlightLogWithAirports | null> {
  return getFlight(ctx, ctx.url.searchParams.get("id") ?? "");
}

export async function addFlight(ctx: Ctx): Promise<{ id: string }> {
  const user = requireUser(ctx);
  const body = await readJson<Record<string, unknown>>(ctx.req);

  const fromIata = str(body.fromIata, "fromIata");
  const toIata = str(body.toIata, "toIata");
  const flightDate = str(body.flightDate, "flightDate");
  const airlineCode = optStr(body.airlineCode);
  const flightNumber = optStr(body.flightNumber);
  const cabin = optCabin(body.cabin);
  const source = optSource(body.source) ?? "manual";
  const rating = optNum(body.rating, "rating");
  const costMinor = optNum(body.costMinor, "costMinor");
  const tripId = optStr(body.tripId);
  const allowDuplicate = body.allowDuplicate === true;

  const from = getAirport(fromIata);
  const to = getAirport(toIata);
  if (!from) throw new UserError(`Unknown origin airport: ${fromIata}`);
  if (!to) throw new UserError(`Unknown destination airport: ${toIata}`);
  if (from.iata === to.iata) throw new UserError("Origin and destination are the same airport");

  if (!isIsoDate(flightDate)) throw new UserError("Date must be yyyy-mm-dd");
  if (rating !== undefined && (rating < 1 || rating > 5)) {
    throw new UserError("Rating must be between 1 and 5");
  }
  if (tripId) await ownTrip(ctx, tripId);

  // The same flight can legitimately be logged twice (two seats, a round trip
  // on a through-flight), so this warns rather than blocks.
  if (!allowDuplicate) {
    const existing = await getDb().query.flights.findMany({
      where: (f, { and: a, eq: e }) => a(e(f.userId, user.id), e(f.flightDate, flightDate)),
    });
    const clash = existing.find(
      (f) =>
        f.fromIata === from.iata &&
        f.toIata === to.iata &&
        (f.flightNumber ?? null) === (flightNumber ?? null) &&
        (f.airlineCode ?? null) === (airlineCode ?? null),
    );
    if (clash) throw new UserError(`ALREADY_LOGGED:${clash.id}`);
  }

  const distanceKm = Math.round(haversineKm(from, to));
  const id = crypto.randomUUID();

  await getDb().insert(flights).values({
    id,
    userId: user.id,
    fromIata: from.iata,
    toIata: to.iata,
    flightDate,
    distanceKm,
    durationMin: estimateDurationMin(distanceKm),
    co2Kg: co2Kg(distanceKm, cabin ?? null),
    source,
    loggedAt: Date.now(),
    ...(airlineCode !== undefined ? { airlineCode: airlineCode.toUpperCase() } : {}),
    ...(optStr(body.airlineName) !== undefined ? { airlineName: optStr(body.airlineName)! } : {}),
    ...(flightNumber !== undefined ? { flightNumber: flightNumber.toUpperCase() } : {}),
    ...(optStr(body.aircraft) !== undefined ? { aircraft: optStr(body.aircraft)! } : {}),
    ...(optStr(body.tailNumber) !== undefined ? { tailNumber: optStr(body.tailNumber)!.toUpperCase() } : {}),
    ...(cabin !== undefined ? { cabin } : {}),
    ...(optStr(body.seat) !== undefined ? { seat: optStr(body.seat)! } : {}),
    ...(costMinor !== undefined ? { costMinor: Math.round(costMinor) } : {}),
    ...(optStr(body.currency) !== undefined ? { currency: optStr(body.currency)!.toUpperCase() } : {}),
    ...(rating !== undefined ? { rating: Math.round(rating) } : {}),
    ...(optStr(body.notes) !== undefined ? { notes: optStr(body.notes)! } : {}),
    ...(tripId !== undefined ? { tripId } : {}),
  } satisfies NewFlightRow);

  return { id };
}

export async function updateFlight(ctx: Ctx): Promise<void> {
  const user = requireUser(ctx);
  const body = await readJson<Record<string, unknown>>(ctx.req);
  const id = str(body.id, "id");

  const doc = await getDb().query.flights.findFirst({
    where: (f, { and: a, eq: e }) => a(e(f.id, id), e(f.userId, user.id)),
  });
  if (!doc) throw new UserError("Not found", 404);

  const rating = body.rating === null ? null : optNum(body.rating, "rating");
  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
    throw new UserError("Rating must be between 1 and 5");
  }

  // `null` means "clear this" in the UI, and clearing is expressed as a SQL NULL
  // rather than by omitting the column.
  const tripId = body.tripId === null ? null : optStr(body.tripId);
  if (tripId) await ownTrip(ctx, tripId);

  const cabin = optCabin(body.cabin);
  const tailNumber = optStr(body.tailNumber);
  const currency = optStr(body.currency);
  const costMinor = optNum(body.costMinor, "costMinor");
  const notes = optStr(body.notes);
  const seat = optStr(body.seat);
  const aircraft = optStr(body.aircraft);

  await getDb()
    .update(flights)
    .set({
      ...(notes !== undefined ? { notes } : {}),
      ...(seat !== undefined ? { seat } : {}),
      ...(aircraft !== undefined ? { aircraft } : {}),
      ...(tailNumber !== undefined ? { tailNumber: tailNumber.toUpperCase() } : {}),
      ...(cabin !== undefined ? { cabin } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(costMinor !== undefined ? { costMinor: Math.round(costMinor) } : {}),
      ...(currency !== undefined ? { currency: currency.toUpperCase() } : {}),
      ...(tripId !== undefined ? { tripId } : {}),
      // Cabin changes the CO2 figure, so keep the two consistent.
      ...(cabin !== undefined && cabin !== doc.cabin ? { co2Kg: co2Kg(doc.distanceKm, cabin) } : {}),
    })
    .where(and(eq(flights.id, id), eq(flights.userId, user.id)));
}

export async function removeFlight(ctx: Ctx): Promise<void> {
  const user = requireUser(ctx);
  const body = await readJson<Record<string, unknown>>(ctx.req);
  const id = str(body.id, "id");

  // Scoped by owner in the DELETE itself, so there is no window between a read
  // and a write where the row could be reassigned.
  const deleted = await getDb()
    .delete(flights)
    .where(and(eq(flights.id, id), eq(flights.userId, user.id)))
    .returning({ id: flights.id });

  if (deleted.length === 0) throw new UserError("Not found", 404);
}

/**
 * Import many flights at once.
 *
 * A real log is hundreds of flights and nobody clicks Add hundreds of times, so
 * this resolves every line in one call. It is deliberately one endpoint and not
 * a loop of `add` calls: one round trip, and one place that can report "line 42
 * did not resolve" without the UI having to reconstruct it.
 *
 * Nothing is thrown away silently. A line that cannot be resolved or has no
 * date comes back as a result row explaining why, and every other line still
 * lands.
 */
export async function importBulk(ctx: Ctx): Promise<ImportRowResult[]> {
  const user = requireUser(ctx);
  const body = await readJson<{ rows?: unknown; tripId?: unknown }>(ctx.req);

  if (!Array.isArray(body.rows)) throw new UserError("rows must be an array");
  const rows = body.rows as ImportRowInput[];
  if (rows.length > 1000) throw new UserError("Import at most 1000 rows at a time");

  const tripId = optStr(body.tripId);
  if (tripId) await ownTrip(ctx, tripId);

  const existing = await getDb().query.flights.findMany({ where: eq(flights.userId, user.id) });

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
  const pending: NewFlightRow[] = [];
  let line = 0;

  for (const row of rows) {
    line += 1;
    const text = (row.text ?? "").trim();
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
    let airlineName = airlineCode ? (getAirline(airlineCode)?.name ?? null) : null;
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
    if (!isIsoDate(date)) {
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
    const id = crypto.randomUUID();

    pending.push({
      id,
      userId: user.id,
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
      ...(tripId !== undefined ? { tripId } : {}),
    });

    results.push({
      ...base,
      status: "added",
      flightId: id,
      fromIata: from.iata,
      toIata: to.iata,
      date,
      airlineName,
      distanceKm,
      message: reason ? `${from.iata} → ${to.iata} · ${reason}` : `${from.iata} → ${to.iata}`,
    });
  }

  // One statement for the whole paste, rather than up to a thousand round trips.
  if (pending.length > 0) await getDb().insert(flights).values(pending);

  return results;
}

/** Enough of a stored flight for a "records" row to render and link to it. */
function describeFlight(doc: FlightRow): LongestFlight {
  const from = getAirport(doc.fromIata);
  const to = getAirport(doc.toIata);
  return {
    id: doc.id,
    fromIata: doc.fromIata,
    toIata: doc.toIata,
    fromCity: from?.city ?? doc.fromIata,
    toCity: to?.city ?? doc.toIata,
    flightDate: doc.flightDate,
    distanceKm: Math.round(doc.distanceKm),
    durationMin: Math.round(doc.durationMin),
  };
}

/**
 * Lifetime statistics for a user's whole log.
 *
 * This still aggregates in JS rather than SQL. The reduction is awkward to
 * express in SQL — direction-independent route keys, a most-visited country,
 * spend split by year and currency — and the rows are one user's own, already
 * narrowed by the `flights_user_idx` index. Porting it is a possible later
 * optimisation, not a prerequisite.
 */
export async function flightStats(ctx: Ctx): Promise<FlightStats | null> {
  if (!ctx.user) return null;
  const rows = await getDb().query.flights.findMany({ where: eq(flights.userId, ctx.user.id) });

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
  let longest: FlightRow | null = null;
  let shortest: FlightRow | null = null;
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
      arrivalsByCountry.set(destination.country, (arrivalsByCountry.get(destination.country) ?? 0) + 1);
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
      routes.set(routeKey, { count: 1, distanceKm: row.distanceKm, dates: [row.flightDate] });
    }

    if (row.costMinor !== null) {
      totalSpendMinor += row.costMinor;
      pricedDistanceKm += row.distanceKm;
      pricedFlightCount += 1;
      const spendYear = row.flightDate.slice(0, 4);
      spendByYear.set(spendYear, (spendByYear.get(spendYear) ?? 0) + row.costMinor);
      const currency = row.currency ?? "USD";
      currencies.set(currency, (currencies.get(currency) ?? 0) + 1);
    }

    const airlineKey = row.airlineCode ?? "unknown";
    const existingAirline = airlines.get(airlineKey);
    if (existingAirline) existingAirline.count += 1;
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
    shortestFlight: shortest && shortestFlightKm < Number.POSITIVE_INFINITY ? describeFlight(shortest) : null,
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
    costPerKmMinor:
      pricedDistanceKm > 0 ? Number(((totalSpendMinor / pricedDistanceKm) * 100).toFixed(2)) : null,
    pricedFlightCount,
    spendByYear: [...spendByYear.entries()]
      .map(([year, minor]) => ({ year, minor }))
      .sort((a, b) => a.year.localeCompare(b.year)),
    mostVisitedCountry: topCountry ? { country: topCountry[0], arrivals: topCountry[1] } : null,
  };
}

export type { FlightLog, FlightLogWithAirports, FlightStats };
