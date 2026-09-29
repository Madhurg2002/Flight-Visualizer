import { getAirline, getAirport, getAirportByIcao } from "@skytrace/data";
import {
  isFailure,
  type FlightLookup,
  type FlightLookupQuery,
  type FlightProvider,
  type FlightStatus,
  type LookupResult,
} from "./types.ts";

/**
 * AeroDataBox.
 *
 * The schedule and flight-status endpoints answer the question the compiled
 * dataset cannot: a flight number maps to a real route on a real date. It
 * returns the operating equipment, the terminal, the gate and both the
 * scheduled and the revised time, so a resolved flight carries the detail a
 * log wants rather than just "it departed".
 *
 * It is the provider here rather than Amadeus because Amadeus retired its
 * self-service portal in July 2026 and disabled every key issued through it;
 * the enterprise portal that replaced it needs a sales contract. A free plan
 * that can still be signed up for is the whole reason there is a provider at
 * all — see docs/environment-variables.md.
 *
 * Two things are unlike the provider it replaced, and both are consequences
 * of how it authenticates:
 *
 * - **There is no token.** The old flow exchanged a client-credential pair for
 *   a bearer token, cached that, and needed the cache so the token request
 *   could not eat the budget. AeroDataBox takes the API key on every call, so
 *   there is nothing to exchange and nothing to expire.
 * - **The metered work moved to the answer itself.** Each call spends one of a
 *   few hundred free units a month, so the cache below holds the *result*
 *   rather than a credential. That is a strictly better place to spend the
 *   saving: a repeated question is answered without touching the network at
 *   all, which the token cache never managed.
 */

const BASE = "https://api.aerodatabox.com";

/** Addresses that never leave the machine, where plain http is not a leak. */
function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Where the calls go.
 *
 * The provider is reached through one of three documented gateways — the
 * direct one, API.Market and RapidAPI — and an account created through a
 * marketplace is served by that marketplace's host with the same paths and the
 * same header. Overridable for that reason, and validated so a typo cannot
 * quietly send the API key to something else entirely.
 */
function baseUrl(): string {
  const override = process.env.AERODATABOX_BASE_URL?.trim();
  if (!override) return BASE;
  let url: URL;
  try {
    url = new URL(override);
  } catch {
    return BASE;
  }
  const host = url.hostname.toLowerCase();
  const isProvider = host === "aerodatabox.com" || host.endsWith(".aerodatabox.com");
  if (isProvider) {
    if (url.protocol !== "https:") return BASE;
  } else if (!isLoopback(host)) {
    // Not the provider, and not this machine. Nothing else may ever see the key.
    return BASE;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * How long an answer is reused.
 *
 * Short, because the thing that changes is the answer: a flight that is
 * `Expected` today is `EnRoute` in two hours, and a log entry built from a
 * stale status is quietly wrong. Long enough to absorb the case that actually
 * costs money — a double-clicked button, or a panel and a dialog asking the
 * same question at the same moment.
 */
const ANSWER_TTL_MS = 60_000;

type Cached = { at: number; result: LookupResult };

const answers = new Map<string, Cached>();

/**
 * The request already in flight for a key, if any.
 *
 * This is the half of the saving that a plain cache cannot do. Three lookups
 * arriving on a cold cache would each miss it and each spend a unit, and the
 * free plan rate-limits to one request a second anyway, so the extras would be
 * rejected rather than merely wasted. Sharing the promise means they wait for
 * the one request and all get its answer.
 */
const inFlight = new Map<string, Promise<LookupResult>>();

/** Forgets every memoised answer. Used by the checks, which stub the network. */
export function resetLookupCache(): void {
  answers.clear();
  inFlight.clear();
}

function apiKey(): string | null {
  const key = process.env.AERODATABOX_API_KEY?.trim();
  return key ? key : null;
}

function isConfigured(): boolean {
  return apiKey() !== null;
}

/* ------------------------------------------------------------------ transport */

/**
 * One request, with the status code kept.
 *
 * `fetchJson` folds every non-2xx into `null`, which is the right answer for a
 * provider that has no useful failure modes. This one has several that mean
 * different things to the user: an empty result is a miss and the client
 * offers to search by date, a rejected key is a configuration problem they
 * have to fix, and a 429 is a rate limit worth retrying. Collapsing them into
 * one 502 would make all three look like a network outage.
 */
async function request(
  url: string,
  key: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(url, {
      headers: { "X-Api-Key": key, accept: "application/json" },
      signal: controller.signal,
    });
    // 204 is the documented "nothing matched" and carries no body at all, so
    // there is nothing to parse.
    if (response.status === 204) return { status: 204, body: null };
    if (!response.ok) return { status: response.status, body: null };
    return { status: 200, body: (await response.json()) as unknown };
  } catch {
    // A timeout, a DNS failure, a TLS error. All of them are upstream, and
    // none of them are worth a stack trace in a log nobody reads.
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ reading */

function at(record: unknown, path: string): unknown {
  let current: unknown = record;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function strAt(record: unknown, path: string): string | undefined {
  const value = at(record, path);
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * A provider timestamp, as the airport's own local wall clock.
 *
 * Every time in the response is a `{ utc, local }` pair. The `local` half is
 * what a flight log wants, and it is taken verbatim: the airport's zone is
 * known to the provider and not to us, so re-deriving it here would be a guess
 * that can be an hour out. A log entry an hour wrong is worse than one that
 * says which clock it read.
 *
 * The value is truncated to `yyyy-mm-ddThh:mm` rather than reformatted, so it
 * stays fixed-width and a string comparison stays chronological — the same
 * property the resolver relies on for the dates it stores.
 */
function localClock(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/Z$/, "");
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)
    ? trimmed.slice(0, 16)
    : undefined;
}

/**
 * "Now" as a wall-clock string, for classifying a status we do not recognise.
 *
 * A local time carries no offset, so it cannot become an instant without the
 * airport's zone. Both sides are therefore compared as wall clocks: the
 * arrival as the airport reported it, and now in UTC. The answer is
 * approximate by up to the offset, and always was, but it no longer depends
 * on what timezone the host happens to run in, so a flight near midnight is
 * classified the same on Render as on a laptop in Kathmandu.
 */
function nowAsLocalClock(): string {
  return new Date().toISOString().slice(0, 16);
}

/**
 * The provider's thirteen states, folded into the seven the app stores.
 *
 * A fold rather than a rename, because the app's set is about how a *log entry*
 * reads — it landed, it is still going, it will not happen — and the
 * provider's is about what the airline is doing right now. `Boarding` and
 * `GateClosed` are different facts about a flight that has not left yet.
 */
const STATUS_MAP: Record<string, FlightStatus> = {
  Expected: "scheduled",
  CheckIn: "scheduled",
  Boarding: "scheduled",
  GateClosed: "scheduled",
  EnRoute: "active",
  Departed: "active",
  Approaching: "active",
  Arrived: "landed",
  Canceled: "cancelled",
  CanceledUncertain: "cancelled",
  Delayed: "delayed",
  Diverted: "diverted",
};

/* ------------------------------------------------------------------ mapping */

/**
 * One end of a flight, as the app knows it.
 *
 * Prefers the IATA code because that is what the rest of the app stores and
 * what the user typed, and falls back to the ICAO code because the provider
 * sends both and a flight to a field with no IATA of its own is a real flight
 * rather than a broken one. Returns null when neither code is one this app has
 * coordinates for: the map and the geometry both need them, so a flight to
 * somewhere unplaceable is refused rather than offered.
 */
function resolveAirport(node: unknown): { iata: string } | null {
  if (typeof node !== "object" || node === null) return null;
  const byIata = strAt(node, "iata");
  if (byIata && getAirport(byIata)) return { iata: byIata.toUpperCase() };
  const byIcao = strAt(node, "icao");
  const fallback = getAirportByIcao(byIcao);
  return fallback ? { iata: fallback.iata.toUpperCase() } : null;
}

/**
 * Turns one provider record into the app's shape, or null if it is not a
 * usable answer.
 *
 * Refusing an unusable record matters more than it looks: a response that
 * names a flight but no airports cannot be saved, and returning it as a
 * partial result would put a half-formed flight in the candidate list.
 */
function toLookup(record: unknown): FlightLookup | null {
  // An airport arrives as a pair of codes and the provider may send only one of
  // them — `iata` and `icao` are each documented as nullable. Resolving on
  // either means a flight to a smaller field, known only by its ICAO code, is
  // still placed rather than refused; every row in the dataset carries both.
  const from = resolveAirport(at(record, "departure.airport"));
  const to = resolveAirport(at(record, "arrival.airport"));
  const departureAt = localClock(at(record, "departure.scheduledTime.local"));
  const arrivalAt = localClock(at(record, "arrival.scheduledTime.local"));
  if (!from || !to || !departureAt || !arrivalAt) return null;
  const fromIata = from.iata;
  const toIata = to.iata;

  const raw = strAt(record, "status") ?? "Unknown";
  // A status the fold does not cover falls back to whether the flight has
  // already arrived, compared wall-clock to wall-clock.
  const status: FlightStatus =
    STATUS_MAP[raw] ?? (arrivalAt < nowAsLocalClock() ? "landed" : "unknown");

  const departure: FlightLookup["departure"] = { iata: fromIata, scheduledAt: departureAt };
  const arrival: FlightLookup["arrival"] = { iata: toIata, scheduledAt: arrivalAt };
  const terminal = strAt(record, "departure.terminal");
  const gate = strAt(record, "departure.gate");
  if (terminal) departure.terminal = terminal;
  if (gate) departure.gate = gate;
  const arrivalTerminal = strAt(record, "arrival.terminal");
  const arrivalGate = strAt(record, "arrival.gate");
  if (arrivalTerminal) arrival.terminal = arrivalTerminal;
  if (arrivalGate) arrival.gate = arrivalGate;

  // `revisedTime` is the actual time once the flight has moved and an estimate
  // before that, which is the closest this gets to "when it really happened".
  // It is labelled as the provider's own revision rather than presented as a
  // confirmed actual, because before departure it is a guess.
  const departureRevised = localClock(at(record, "departure.revisedTime.local"));
  const arrivalRevised = localClock(at(record, "arrival.revisedTime.local"));
  if (departureRevised) departure.actualAt = departureRevised;
  if (arrivalRevised) arrival.actualAt = arrivalRevised;

  // The model is what a log records; the tail number is a fact about one
  // aircraft rather than about the flight, and is not a field the log stores.
  const aircraft = strAt(record, "aircraft.model");

  // No note is attached. The provider identifies a code-share as "operated by
  // some other airline" without naming which one, and naming the marketing
  // carrier as the operator is exactly the confident wrong answer this app
  // refuses to give elsewhere.
  const carrier = strAt(record, "airline.iata");

  return {
    status,
    departure,
    arrival,
    aircraft,
    note:
      carrier && strAt(record, "codeshareStatus") === "IsCodeshared" && getAirline(carrier)
        ? `Codeshared by ${getAirline(carrier)!.name}`
        : undefined,
  };
}

/* ----------------------------------------------------------------- provider */

function cacheKey(query: FlightLookupQuery): string {
  return `${query.airline}${query.flightNumber}|${query.date ?? ""}`;
}

/**
 * Where a flight is looked up, and why the URL is shaped this way.
 *
 * With a date, the three-segment form is used: it is a question about that day
 * rather than about the flight. Without one, the two-segment form answers for
 * the nearest operating date in either direction, which is what a user who
 * typed only `UA 1234` is asking.
 *
 * `dateLocalRole=Both` is sent explicitly even though it is the documented
 * default. A red-eye departing the evening before is the flight someone means
 * when they type the morning it lands, and relying on a default that a
 * provider could change is a quiet way to lose it.
 */
function requestUrl(query: FlightLookupQuery): string {
  // The provider accepts a flight number with or without a separator, in any
  // case, IATA or ICAO. The joined form is the canonical one.
  const number = encodeURIComponent(`${query.airline}${query.flightNumber}`);
  const date = query.date ? `/${encodeURIComponent(query.date)}` : "";
  return `${baseUrl()}/flights/Number/${number}${date}?dateLocalRole=Both`;
}

function interpret(status: number, body: unknown): LookupResult {
  // An empty body with a success status is a real answer: the provider was
  // asked and knows of no such flight. It is a miss, not an outage, and the
  // difference decides whether the client offers to search by date instead.
  if (status === 204) return { ok: false, reason: { kind: "not-found" } };
  if (status === 400) return { ok: false, reason: { kind: "invalid" } };
  // 401 is a key the provider will not accept, 403 an account not entitled to
  // this endpoint, 451 a plan that does not cover it. All three are the
  // operator's configuration to fix, and none of them is a bad flight number,
  // so they are refused rather than reported as a miss that invites a retry.
  if (status === 401 || status === 403 || status === 451) {
    return { ok: false, reason: { kind: "provider-rejected" } };
  }
  if (status !== 200) return { ok: false, reason: { kind: "provider-unavailable" } };

  const rows = Array.isArray(body) ? body : [];
  if (rows.length === 0) return { ok: false, reason: { kind: "not-found" } };

  for (const row of rows) {
    const flight = toLookup(row);
    if (flight) return { ok: true, flight };
  }
  // Something came back, but nothing usable: the airports do not resolve to
  // codes this app has coordinates for, so there is nothing that could be
  // saved or drawn.
  return { ok: false, reason: { kind: "provider-rejected" } };
}

export const aeroDataBoxProvider: FlightProvider = {
  name: "aerodatabox",

  isConfigured,

  async lookup(query: FlightLookupQuery): Promise<LookupResult> {
    const key = apiKey();
    if (!key) return { ok: false, reason: { kind: "not-configured" } };

    const id = cacheKey(query);
    const cached = answers.get(id);
    if (cached && Date.now() - cached.at < ANSWER_TTL_MS) return cached.result;

    const pending = inFlight.get(id);
    if (pending) return pending;

    const answer = (async (): Promise<LookupResult> => {
      const { status, body } = await request(requestUrl(query), key);
      const result = interpret(status, body);
      // Only a settled answer is remembered. A miss is remembered too — the
      // provider is the authority on whether the flight exists — but an
      // upstream failure is not, so a provider that is briefly down is retried
      // instead of being answered from its own outage for a minute.
      //
      // Written as a negative test rather than `result.ok || result.reason…`:
      // narrowing on the right of an `||` is the one place the two arms can be
      // read under different assumptions, and the deployment host's checker
      // disagreed with the repository's about it.
      const failedUpstream = isFailure(result) && result.reason.kind === "provider-unavailable";
      if (!failedUpstream) {
        answers.set(id, { at: Date.now(), result });
      }
      return result;
    })();

    inFlight.set(id, answer);
    try {
      return await answer;
    } finally {
      // Cleared either way, so a failure is never cached as a failure.
      inFlight.delete(id);
    }
  },
};
