/**
 * The resolver: turns what the user vaguely remembers into ranked flight
 * candidates.
 *
 * Design rule — never guess silently. Anything below `high` confidence is
 * surfaced as a choice for the user to confirm, and a candidate always carries
 * the reason it was proposed. When we can only narrow the search, we return
 * the strongest options we have and list what is still missing rather than
 * inventing an answer.
 */
import { getAirline, getAirport, type Airport } from "@skytrace/data";
import type { FlightCandidate, MatchConfidence, ResolveResult } from "@skytrace/types";
import { co2Kg } from "./emissions.ts";
import { estimateDurationMin, haversineKm } from "./geo.ts";
import type { ParsedInput } from "./parse.ts";

export type RouteRow = { airline: string; src: string; dest: string; count: number };

export type ResolverDeps = {
  routeRows: readonly RouteRow[];
  /**
   * Airports the user has already logged, used to nudge likely next hops up
   * the list when we have to guess a destination.
   */
  visitedIatas?: ReadonlySet<string>;
};

const MAX_SUGGESTIONS = 6;

/** Below this many routes an airport is not somewhere we would suggest flying. */
const MIN_HUB_ROUTES = 60;

function buildCandidate(args: {
  from: Airport;
  to: Airport;
  airlineCode: string | null;
  airlineName: string | null;
  flightNumber: string | null;
  date: string | null;
  confidence: MatchConfidence;
  score: number;
  reason: string;
  source: FlightCandidate["source"];
}): FlightCandidate {
  const distanceKm = Math.round(haversineKm(args.from, args.to));
  return {
    key: `${args.airlineCode ?? "?"}${args.flightNumber ?? "?"}-${args.from.iata}-${args.to.iata}-${args.date ?? "nodate"}`,
    confidence: args.confidence,
    score: args.score,
    reason: args.reason,
    source: args.source,
    airlineCode: args.airlineCode,
    airlineName: args.airlineName,
    flightNumber: args.flightNumber,
    date: args.date,
    fromIata: args.from.iata,
    fromName: args.from.name,
    fromCity: args.from.city,
    fromLat: args.from.lat,
    fromLon: args.from.lon,
    toIata: args.to.iata,
    toName: args.to.name,
    toCity: args.to.city,
    toLat: args.to.lat,
    toLon: args.to.lon,
    distanceKm,
    durationMin: estimateDurationMin(distanceKm),
    co2Kg: co2Kg(distanceKm),
  };
}

/** Confidence is a judgement about what is still unknown, not a probability. */
function confidenceFor(known: { route: boolean; airline: boolean; date: boolean }): MatchConfidence {
  if (known.route && known.airline && known.date) return "exact";
  if (known.route) return "high";
  if (known.airline) return "medium";
  return "low";
}

export function resolveFlight(
  parsed: ParsedInput,
  deps: ResolverDeps,
): ResolveResult {
  const airline = getAirline(parsed.airlineCode);
  const airlineCode = parsed.airlineCode;
  const airlineName = airline?.name ?? null;

  const from = getAirport(parsed.fromIata);
  const to = getAirport(parsed.toIata);

  const missing: string[] = [];
  if (!from) missing.push("origin");
  if (!to) missing.push("destination");
  if (!airline) missing.push("airline");
  if (!parsed.date) missing.push("date");

  const candidates: FlightCandidate[] = [];
  const routeIsKnown = Boolean(from && to);

  if (from && to) {
    // Both endpoints are known, so the flown path is certain. The airline and
    // date are metadata we display, not things that can change the answer.
    const confidence = confidenceFor({
      route: true,
      airline: Boolean(airline),
      date: Boolean(parsed.date),
    });
    const reasonParts = [`${from.iata} → ${to.iata}`];
    if (airlineName) reasonParts.push(airlineName);
    if (parsed.flightNumber) reasonParts.push(`flight ${parsed.flightNumber}`);
    if (parsed.date) reasonParts.push(parsed.date);

    candidates.push(
      buildCandidate({
        from,
        to,
        airlineCode,
        airlineName,
        flightNumber: parsed.flightNumber,
        date: parsed.date,
        confidence,
        score: 1000,
        reason: `You told us the route. ${reasonParts.join(" · ")}`,
        source: "resolved",
      }),
    );
  }

  // Not both endpoints: fall back to the known-route table, narrowed by
  // whatever single endpoint or airline the user did give us.
  if (!routeIsKnown && airlineCode) {
    // Whichever end we know becomes the filter. Narrowing on the origin only
    // would ignore "United to Tokyo" entirely and offer United's global hubs
    // instead of the routes that actually serve Tokyo.
    const anchor = from ?? to;
    const anchorIsOrigin = Boolean(from);

    const narrowed = deps.routeRows
      .filter((r) => r.airline === airlineCode)
      .filter((r) => (anchor ? r.src === anchor.iata || r.dest === anchor.iata : true))
      .slice(0, 80);

    // A route and its return are the same answer to the user. Offer each
    // opposite end once, oriented the way they are most likely to have flown.
    const seenOpposites = new Set<string>();

    for (const row of narrowed) {
      if (candidates.length >= MAX_SUGGESTIONS) break;

      let src = getAirport(row.src);
      let dest = getAirport(row.dest);
      if (!src || !dest) continue;

      if (anchor) {
        // Flip the row if the known end is the "wrong" side, so every
        // suggestion is presented from the user's point of view.
        const flipped = anchorIsOrigin ? row.dest === anchor.iata : row.src === anchor.iata;
        if (flipped) {
          const swap = src;
          src = dest;
          dest = swap;
        } else if (anchorIsOrigin ? row.src !== anchor.iata : row.dest !== anchor.iata) {
          continue;
        }
      } else if (src.routes < MIN_HUB_ROUTES || dest.routes < MIN_HUB_ROUTES) {
        // Nothing was pinned down, so every route the carrier files is a
        // candidate — including hundreds of regional hops and codeshares.
        // Requiring both ends to be real hubs is what makes the top of this
        // list useful instead of a list of Allentown.
        continue;
      }

      if (seenOpposites.has(dest.iata)) continue;
      seenOpposites.add(dest.iata);

      // A route to somewhere already visited is a weaker guess than a new one.
      const revisits = deps.visitedIatas?.has(dest.iata) ? -12 : 0;
      // Weight by how big both endpoints are as well as raw frequency, so a
      // well-connected hop beats a heavily codeshared regional one.
      const hub = Math.min(200, (src.routes + dest.routes) / 2);
      const known = Boolean(anchor);
      candidates.push(
        buildCandidate({
          from: src,
          to: dest,
          airlineCode,
          airlineName,
          flightNumber: parsed.flightNumber,
          date: parsed.date,
          confidence: known ? "high" : "medium",
          score: row.count * 2 + hub * 3 + revisits,
          reason: known
            ? `${airlineName ?? airlineCode} operates ${src.iata} → ${dest.iata}, and it matches the ${anchorIsOrigin ? "origin" : "destination"} you gave.`
            : `One of ${airlineName ?? airlineCode}'s most frequent routes. We do not know the airports yet, so pick the one you remember.`,
          source: "resolved",
        }),
      );
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return {
    candidates,
    missing,
    parsed: {
      airlineCode: parsed.airlineCode,
      flightNumber: parsed.flightNumber,
      date: parsed.date,
      fromIata: parsed.fromIata,
      toIata: parsed.toIata,
    },
  };
}
