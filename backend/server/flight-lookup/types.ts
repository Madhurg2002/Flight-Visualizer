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

/**
 * Why a lookup could not be answered. Never rendered raw.
 *
 * Each of these needs a different sentence, which is why they are separate
 * kinds rather than one reason with a message attached. Every time two
 * genuinely different problems have shared a kind here, the user has been
 * told to look at the wrong system: an exhausted plan was reported as a
 * network outage, and a refused key was reported as a flight the map could not
 * draw. Both were unhelpful in the same way — the message named something
 * other than the thing to go and fix.
 *
 * - `provider-rejected` — the provider refused the *key* (401, 403). The
 *   operator's problem, and nothing about the flight asked.
 * - `provider-unplaceable` — the provider answered, but with something this
 *   app cannot use: an airport it has no coordinates for.
 * - `quota-exhausted` — the plan is spent. `retryable` is the whole
 *   difference: a `429` clears on its own, a `402` does not until somebody
 *   pays for more.
 */
export type LookupFailure =
  | { kind: "not-configured" }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "provider-unavailable" }
  | { kind: "provider-rejected" }
  | { kind: "provider-unplaceable" }
  | { kind: "quota-exhausted"; retryable: boolean };

export type LookupResult = { ok: true; flight: FlightLookup } | { ok: false; reason: LookupFailure };

/** The failure half of a `LookupResult`, named for callers that switch on it. */
export type LookupFailureResult = { ok: false; reason: LookupFailure };

/**
 * Whether a lookup failed.
 *
 * Reading `result.reason` after `if (result.ok) return` works by ordinary
 * union narrowing, and that narrowing is not something every TypeScript
 * invocation performs the same way: the deployment host type-checks this
 * package and reports `Property 'reason' does not exist on type
 * 'LookupResult'` for exactly those two call sites, while the repository's
 * own check does not. A caller written against this guard is narrowed by the
 * guard's declared return type, which the compiler takes on trust, so the
 * answer does not depend on which narrowing path the checker happens to take.
 *
 * The `in` test is what makes the guard sound without narrowing anything
 * itself — `reason` is present on one member of the union and not the other.
 */
export function isFailure(result: LookupResult): result is LookupFailureResult {
  return "reason" in result;
}

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
