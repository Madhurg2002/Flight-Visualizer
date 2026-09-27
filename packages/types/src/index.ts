/**
 * Domain types shared between the Convex backend and the React app.
 * Keep this package free of runtime dependencies so both sides can import it.
 */

export type Cabin = "economy" | "premium_economy" | "business" | "first";

/** How a stored flight was arrived at, kept for provenance in the UI. */
export type FlightSource =
  | "resolved" // the resolver matched a known route
  | "manual" // the user typed the details themselves
  | "imported"; // bulk paste / CSV import

/**
 * How sure we are that a candidate is the flight the user meant.
 * The resolver never auto-picks below `high` — it asks instead.
 */
export type MatchConfidence = "exact" | "high" | "medium" | "low";

/** What a user can tell us about a flight, at varying levels of detail. */
export type FlightLookupInput = {
  /** Free text, e.g. "UA 1234 in March 2025" or "SFO to JFK last summer". */
  query?: string;
  airlineCode?: string;
  flightNumber?: string;
  /** ISO `yyyy-mm-dd`. */
  date?: string;
  from?: string;
  to?: string;
};

/** A resolved flight the user can accept, with the reasoning attached. */
export type FlightCandidate = {
  /** Stable key for React lists and disambiguation picking. */
  key: string;
  confidence: MatchConfidence;
  /** 0-100, used only for ordering. */
  score: number;
  /** Why the resolver surfaced this, shown verbatim in the UI. */
  reason: string;
  source: FlightSource;
  airlineCode: string | null;
  airlineName: string | null;
  flightNumber: string | null;
  /** ISO `yyyy-mm-dd`, or null when the user never told us. */
  date: string | null;
  fromIata: string;
  fromName: string;
  fromCity: string;
  fromLat: number;
  fromLon: number;
  toIata: string;
  toName: string;
  toCity: string;
  toLat: number;
  toLon: number;
  distanceKm: number;
  durationMin: number;
  co2Kg: number;
};

export type ResolveResult = {
  candidates: FlightCandidate[];
  /** Fields the resolver still needs before it can be confident, e.g. "origin". */
  missing: string[];
  /** What we managed to understand from the raw text, for the review step. */
  parsed: {
    airlineCode: string | null;
    flightNumber: string | null;
    date: string | null;
    fromIata: string | null;
    toIata: string | null;
  };
};

/** A flight the user has logged. Mirrors the `flights` Convex table. */
export type FlightLog = {
  id: string;
  airlineCode: string | null;
  airlineName: string | null;
  flightNumber: string | null;
  /** ISO `yyyy-mm-dd`. */
  flightDate: string;
  fromIata: string;
  toIata: string;
  distanceKm: number;
  durationMin: number;
  co2Kg: number;
  aircraft: string | null;
  tailNumber: string | null;
  cabin: Cabin | null;
  seat: string | null;
  /** Stored in minor units (cents) to avoid float drift. */
  costMinor: number | null;
  currency: string | null;
  rating: number | null;
  notes: string | null;
  source: FlightSource;
  tripId: string | null;
  loggedAt: number;
};

/** A flight plus the resolved airport coordinates the map needs. */
export type FlightLogWithAirports = FlightLog & {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  fromName: string;
  toName: string;
  fromCity: string;
  toCity: string;
  countryOfOrigin: string;
  countryOfDest: string;
};

export type Trip = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  createdAt: number;
  /** How many logged flights carry this trip, computed on read. */
  flightCount: number;
};

/** The single longest flight in the log, with enough detail to link to it. */
export type LongestFlight = {
  id: string;
  fromIata: string;
  toIata: string;
  fromCity: string;
  toCity: string;
  flightDate: string;
  distanceKm: number;
  durationMin: number;
};

/** A route the user has flown more than once. */
export type RepeatedRoute = {
  fromIata: string;
  toIata: string;
  count: number;
  distanceKm: number;
  firstDate: string;
  lastDate: string;
};

/** Aggregate numbers derived server-side from the user's whole log. */
export type FlightStats = {
  flightCount: number;
  airlineCount: number;
  airportCount: number;
  countryCount: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  totalCo2Kg: number;
  longestFlightKm: number;
  /** The flight behind `longestFlightKm`, or null on an empty log. */
  longestFlight: LongestFlight | null;
  /** Shortest flight too, because "my shortest hop" is a real question. */
  shortestFlight: LongestFlight | null;
  flightsByYear: { year: string; count: number; distanceKm: number }[];
  topAirlines: { code: string | null; name: string | null; count: number }[];
  /** Routes flown more than once, most-flown first. */
  repeatedRoutes: RepeatedRoute[];
  /** How many flights sit in a route the user has flown before. */
  repeatFlightCount: number;
  /** Totals across flights that recorded a fare, in minor units. */
  totalSpendMinor: number;
  /** Currency most of those fares were recorded in, for display. */
  spendCurrency: string | null;
  /** Fares per km, over priced flights only. Null when no fare was recorded. */
  costPerKmMinor: number | null;
  /** Flights that recorded a fare, the denominator of `costPerKmMinor`. */
  pricedFlightCount: number;
  spendByYear: { year: string; minor: number }[];
  /** Most-visited country, by the number of arrivals. */
  mostVisitedCountry: { country: string; arrivals: number } | null;
};
