import { getAirline, getAirport } from "@skytrace/data";
import {
  fetchJson,
  type FlightLookup,
  type FlightLookupQuery,
  type FlightProvider,
  type FlightStatus,
  type LookupResult,
} from "./types.ts";

/**
 * Amadeus Self-Service.
 *
 * The schedule and flight-status APIs, which are the two that answer the
 * question this app cannot answer offline: a flight number maps to a real
 * route on a real date. Everything is authenticated with an OAuth2 client
 * credential pair, exchanged for a token and cached until shortly before it
 * expires — the free tier counts API calls, and a token request per lookup
 * would spend half the budget before answering anything.
 *
 * Amadeus is chosen over a simpler single-key aggregator for one reason that
 * only shows up in use: it returns the operating carrier, the equipment and
 * the terminal, so a seeded or resolved flight carries the detail a log wants
 * rather than just "it departed".
 */

const BASE = "https://test.api.amadeus.com";
const PRODUCTION = "https://api.amadeus.com";

/** Cached until shortly before expiry, so a lookup never races the clock. */
let token: { value: string; expiresAt: number } | null = null;

/**
 * The token request currently in flight, if any.
 *
 * Concurrent lookups share one request rather than each making their own. A
 * cold cache with three lookups open would otherwise spend three of the free
 * tier's calls on authentication before answering any of them, and the token
 * endpoint rate-limits far more aggressively than the data endpoints do.
 */
let inFlight: Promise<string | null> | null = null;

export function resetTokenCache(): void {
  token = null;
  inFlight = null;
}

function baseUrl(): string {
  return process.env.AMADEUS_ENV === "production" ? PRODUCTION : BASE;
}

function isConfigured(): boolean {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}

async function accessToken(): Promise<string | null> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;

  // `??=` is the dedupe: the first caller starts the request and everyone
  // arriving while it is in flight waits on the same promise. `finally`
  // clears it either way, so a failed attempt is retried rather than cached
  // as a failure for the life of the process.
  inFlight ??= requestToken()
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function requestToken(): Promise<string | null> {
  const id = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) return null;

  const body = await fetchJson(`${baseUrl()}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  const accessTokenValue = readString(body, "access_token");
  if (!accessTokenValue) return null;
  token = { value: accessTokenValue, expiresAt: Date.now() + readNumber(body, "expires_in") * 1000 };
  return token.value;
}

/* ------------------------------------------------------------------ reading */

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" && found !== "" ? found : null;
}

function readNumber(value: unknown, key: string): number {
  if (typeof value !== "object" || value === null) return 0;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "number" && Number.isFinite(found) ? found : 0;
}

function records(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) return [];
  const found = (value as Record<string, unknown>).data;
  return Array.isArray(found) ? found : [];
}

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
 * Amadeus reports a local time with no zone, so `2025-03-14T10:35:00` is
 * local to the airport it belongs to. It is passed through as-is and labelled
 * as the airport's local time, rather than being coerced to UTC and silently
 * shifted — a flight log that is an hour wrong is worse than one that says
 * which clock it read.
 */
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function localTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/Z$/, "");
  return LOCAL_TIME.test(trimmed) ? trimmed.slice(0, 16) : undefined;
}

/**
 * "Now" as a wall-clock string, for comparing against a provider's local time.
 *
 * A local time carries no offset, so it cannot be turned into an instant
 * without knowing the airport's zone — which is the whole reason it is passed
 * through untouched everywhere else. Both sides of the comparison are therefore
 * read as wall clocks: the arrival as the airport reported it, and now in UTC.
 * The answer is approximate by up to the offset, and always was, but it no
 * longer depends on what timezone the host happens to run in, so a flight near
 * midnight is classified the same on Render as on a laptop in Kathmandu.
 */
function nowAsLocalClock(): string {
  return new Date().toISOString().slice(0, 16);
}

const STATUS_MAP: Record<string, FlightStatus> = {
  scheduled: "scheduled",
  onTime: "scheduled",
  active: "active",
  landed: "landed",
  arrived: "landed",
  cancelled: "cancelled",
  canceled: "cancelled",
  delayed: "delayed",
  diverted: "diverted",
};

/* ------------------------------------------------------------------ mapping */

/**
 * Turns one provider record into the app's shape, or null if it is not a
 * usable answer.
 *
 * Refusing an unusable record matters more than it looks: a response that
 * names a flight but no airports cannot be saved, and returning it as a
 * partial result would put a half-formed flight in the candidate list.
 */
function toLookup(record: unknown): FlightLookup | null {
  const fromIata = strAt(record, "departure.iataCode");
  const toIata = strAt(record, "arrival.iataCode");
  const departureAt = localTime(at(record, "departure.scheduled"));
  const arrivalAt = localTime(at(record, "arrival.scheduled"));
  if (!fromIata || !toIata || !departureAt || !arrivalAt) return null;

  // The dataset is the authority on whether these are real airports. If a
  // provider names a code the app has never heard of, the flight is dropped
  // rather than offered — the map and the geometry both need coordinates.
  if (!getAirport(fromIata) || !getAirport(toIata)) return null;

  const raw = strAt(record, "flightDesignator.status") ?? "Scheduled";
  const mapped = STATUS_MAP[raw];
  // Fixed-width, zero-padded `yyyy-mm-ddThh:mm`, so a string comparison is
  // chronological and needs no parsing.
  const status: FlightStatus = mapped ?? (arrivalAt < nowAsLocalClock() ? "landed" : "unknown");

  const departure: FlightLookup["departure"] = { iata: fromIata, scheduledAt: departureAt };
  const arrival: FlightLookup["arrival"] = { iata: toIata, scheduledAt: arrivalAt };
  const terminal = (side: "departure" | "arrival", field: string) => {
    const value = strAt(record, `${side}.${field}`);
    return value ? { terminal: field === "terminal" ? value : undefined, gate: field === "gate" ? value : undefined } : undefined;
  };
  const depDetail = terminal("departure", "terminal");
  const depGate = terminal("departure", "gate");
  const arrDetail = terminal("arrival", "terminal");
  const arrGate = terminal("arrival", "gate");
  if (depDetail?.terminal) departure.terminal = depDetail.terminal;
  if (depGate?.gate) departure.gate = depGate.gate;
  if (arrDetail?.terminal) arrival.terminal = arrDetail.terminal;
  if (arrGate?.gate) arrival.gate = arrGate.gate;

  departure.actualAt = localTime(at(record, "departure.actual"));
  arrival.actualAt = localTime(at(record, "arrival.actual"));

  const carrier = strAt(record, "airline.iataCode");
  return {
    status,
    departure,
    arrival,
    aircraft: strAt(record, "aircraft.type"),
    note: carrier && getAirline(carrier) ? `Operated by ${getAirline(carrier)!.name}` : undefined,
  };
}

/* ----------------------------------------------------------------- provider */

export const amadeusProvider: FlightProvider = {
  name: "amadeus",

  isConfigured,

  async lookup(query: FlightLookupQuery): Promise<LookupResult> {
    if (!isConfigured()) return { ok: false, reason: { kind: "not-configured" } };

    const bearer = await accessToken();
    if (!bearer) return { ok: false, reason: { kind: "provider-unavailable" } };

    const params = new URLSearchParams({
      carrierCode: query.airline,
      flightNumber: query.flightNumber,
      max: "3",
    });
    if (query.date) params.set("scheduledDepartureDate", query.date);

    const body = await fetchJson(
      `${baseUrl()}/v2/schedule/flights?${params.toString()}`,
      { headers: { authorization: `Bearer ${bearer}`, accept: "application/vnd.amadeus+json" } },
    );

    // A 200 with an empty `data` is a real answer: the provider was asked and
    // knows the flight. It is a miss, not an outage, and the difference decides
    // whether the client offers to search by date instead.
    if (body === null) return { ok: false, reason: { kind: "provider-unavailable" } };

    const rows = records(body);
    if (rows.length === 0) return { ok: false, reason: { kind: "not-found" } };

    for (const row of rows) {
      const flight = toLookup(row);
      if (flight) return { ok: true, flight };
    }
    // Something came back, but nothing usable: the code does not resolve to a
    // known airport, so there is nothing that could be saved.
    return { ok: false, reason: { kind: "provider-rejected" } };
  },
};
