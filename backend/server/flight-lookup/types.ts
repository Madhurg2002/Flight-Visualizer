/**
 * Real flight data, looked up on the server.
 *
 * The app has always worked with no API key, and that is a property worth
 * keeping: the resolver reads a dataset compiled into the repository, so a
 * stranger can type "United to Tokyo" with nothing configured. This module
 * adds the one thing that dataset genuinely cannot do — turn "UA 1234" into a
 * route — without making that dependency mandatory. If no credentials are
 * configured, `isConfigured()` is false, the route says so, and the client
 * falls back to the offline resolver exactly as it does today. Nothing about
 * the app's existing behaviour depends on this succeeding.
 *
 * Two rules, and they are the whole design:
 *
 * - **The key never leaves the server.** Every call is made from a route
 *   handler. There is no browser-side client and no way to add one without
 *   writing a new one, because the credentials are read from the environment
 *   and the environment is not in the bundle.
 * - **A provider is a value, not a dependency.** `lookupFlight` is an
 *   interface, so the second source is a second implementation rather than a
 *   rewrite. Nothing outside this file knows which provider answered.
 *
 * A lookup is metered by the provider, so the route is behind authentication
 * and answers a repeated question from nothing rather than from the network.
 */

/** What a caller wants to know about a flight. */
export type FlightLookupQuery = {
  /** IATA or ICAO airline code, e.g. `UA` or `UAL`. */
  airline: string;
  /** Flight number as published, e.g. `1234` or `UA1234`. */
  flightNumber: string;
  /** `yyyy-mm-dd`. Optional: a bare number is often enough to find the flight. */
  date?: string;
};

export type FlightStatus =
  | "scheduled"
  | "active"
  | "landed"
  | "cancelled"
  | "delayed"
  | "diverted"
  | "unknown";

export type FlightLookup = {
  status: FlightStatus;
  /** IATA codes, resolved from the provider's own data rather than guessed. */
  departure: { iata: string; terminal?: string; gate?: string; scheduledAt: string; actualAt?: string };
  arrival: { iata: string; terminal?: string; gate?: string; scheduledAt: string; actualAt?: string };
  aircraft?: string;
  /** Free text, only ever provider-supplied. */
  note?: string;
};

/** Why a lookup could not be answered. Never rendered raw. */
export type LookupFailure =
  | { kind: "not-configured" }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "provider-unavailable" }
  | { kind: "provider-rejected" };

export type LookupResult = { ok: true; flight: FlightLookup } | { ok: false; reason: LookupFailure };

export interface FlightProvider {
  readonly name: string;
  isConfigured(): boolean;
  lookup(query: FlightLookupQuery): Promise<LookupResult>;
}

/** Splits `UA1234`, `UA 1234` or `1234` into its parts, or null if unusable. */
export function normaliseQuery(
  airline: string | null,
  flightNumber: string | null,
): { airline: string; flightNumber: string } | null {
  const raw = `${airline ?? ""} ${flightNumber ?? ""}`.trim().toUpperCase();
  // The carrier is letters only. Allowing digits in it — `[A-Z0-9]{2,3}` — makes
  // `UA1234` parse as carrier `UA1`, number `234`, which is a confident wrong
  // answer rather than a failure, and a failure is far easier to notice.
  const match = /^(?:([A-Z]{2,3})\s*)?(\d{1,5}[A-Z]?)$/.exec(raw.replace(/\s+/g, " "));
  if (!match) return null;
  // A number with no carrier is common enough to type, but it is not a
  // complete query: without an airline the provider has to search rather than
  // look up, and the honest answer is to say what is missing.
  if (!match[1]) return null;
  return { airline: match[1]!, flightNumber: match[2]! };
}

const TIMEOUT_MS = 6_000;

export { fetchJson };

/**
 * `fetch` with a deadline.
 *
 * A provider that hangs must not become a hung API: the free tier this app
 * targets has cold starts of its own, and a request with no timeout will hold
 * the socket open until the platform kills it.
 */
async function fetchJson(url: string, init: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    // A timeout, a DNS failure, a TLS error: all of them mean the same thing
    // to the caller, and none of them are worth a stack trace in a log the
    // user will never read.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
