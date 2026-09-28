import { useCallback, useEffect, useSyncExternalStore } from "react";
import type {
  Cabin,
  FlightLogWithAirports,
  FlightSource,
  FlightStats,
  ImportRowInput,
  ImportRowResult,
  ResolveResult,
  Trip,
} from "@skytrace/types";

/**
 * The data client, replacing Convex.
 *
 * The shape of this file is deliberately the same as the Convex API it stands
 * in for — `useQuery(api.flights.list, {})` and `useMutation(api.flights.add)`
 * — so the thirty call sites across the app changed their import and nothing
 * else. What differs is underneath:
 *
 * - Convex pushed updates over a WebSocket; this polls, and refetches eagerly
 *   whenever a mutation lands. For a personal flight log the practical
 *   difference is nil, and the app has no other clients.
 * - Convex validated every argument against a `v` validator. That validation
 *   now lives in the route handlers, in `server/http.ts` and above, so it is
 *   enforced once, on the server, for every client.
 */

/**
 * One endpoint: a path, a method, and the types of what goes in and comes back.
 *
 * The argument and result types are the same ones Convex's generated code
 * carried, so the call sites keep the checking they had. The server validates
 * every argument again — this is for the compiler, not for safety.
 */
export type Endpoint<TArgs, TResult> = {
  readonly path: string;
  readonly method: "GET" | "POST";
  /** Phantom fields: they carry the types, they are never read at runtime. */
  readonly __args?: TArgs;
  readonly __result?: TResult;
};

function endpoint<TArgs, TResult>(method: "GET" | "POST", path: string): Endpoint<TArgs, TResult> {
  return { method, path };
}

/** Query arguments are always sent as query-string parameters. */
type QueryArgs = Record<string, unknown>;

/** What `add` accepts, mirroring the old Convex `v` validator. */
export type AddFlightArgs = {
  fromIata: string;
  toIata: string;
  /** ISO `yyyy-mm-dd`. */
  flightDate: string;
  airlineCode?: string;
  airlineName?: string;
  flightNumber?: string;
  aircraft?: string;
  tailNumber?: string;
  cabin?: Cabin;
  seat?: string;
  costMinor?: number;
  currency?: string;
  rating?: number;
  notes?: string;
  tripId?: string;
  source?: FlightSource;
  /** Lets the UI ask "you already logged this one — add anyway?". */
  allowDuplicate?: boolean;
};

/**
 * `null` clears a field; omitting the key leaves it alone. That distinction is
 * the whole reason these are nullable rather than optional.
 */
export type UpdateFlightArgs = {
  id: string;
  notes?: string;
  seat?: string;
  aircraft?: string;
  tailNumber?: string;
  cabin?: Cabin;
  rating?: number | null;
  costMinor?: number;
  currency?: string;
  tripId?: string | null;
};

/** The fields the add-flight autocomplete shows. */
export type AirportSuggestion = {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  routes: number;
};

export type AirlineSuggestion = {
  iata: string;
  icao: string;
  name: string;
  callsign: string;
  country: string;
  routes: number;
};

/**
 * The API surface, mirroring the old `api.flights.*` namespace exactly so the
 * components read the same as they did under Convex.
 */
export const api = {
  flights: {
    list: endpoint<Record<string, never>, FlightLogWithAirports[]>("GET", "/flights"),
    get: endpoint<QueryArgs, FlightLogWithAirports | null>("GET", "/flights/get"),
    stats: endpoint<Record<string, never>, FlightStats | null>("GET", "/flights/stats"),
    add: endpoint<AddFlightArgs, { id: string }>("POST", "/flights/add"),
    update: endpoint<UpdateFlightArgs, null>("POST", "/flights/update"),
    importBulk: endpoint<{ rows: ImportRowInput[]; tripId?: string }, ImportRowResult[]>(
      "POST",
      "/flights/importBulk",
    ),
    remove: endpoint<{ id: string }, null>("POST", "/flights/remove"),
  },
  trips: {
    list: endpoint<Record<string, never>, Trip[]>("GET", "/trips"),
    create: endpoint<{ name: string; startDate: string; endDate?: string }, string>(
      "POST",
      "/trips/create",
    ),
    remove: endpoint<{ id: string }, null>("POST", "/trips/remove"),
  },
  airports: {
    searchAirport: endpoint<{ query: string; limit?: number }, AirportSuggestion[]>(
      "GET",
      "/airports/search",
    ),
    searchAirline: endpoint<{ query: string; limit?: number }, AirlineSuggestion[]>(
      "GET",
      "/airports/airline",
    ),
    lookupAirport: endpoint<{ iata: string }, AirportSuggestion | null>("GET", "/airports/lookup"),
  },
  resolve: {
    resolve: endpoint<{ query: string }, ResolveResult>("GET", "/resolve"),
  },
  users: {
    me: endpoint<Record<string, never>, string | null>("GET", "/users/me"),
  },
} as const;

/** Thrown for any non-2xx response, carrying the server's message verbatim. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    // Same-origin, so the session cookie is sent; without this the fetch would
    // carry no credentials and every signed-in request would come back
    // anonymous.
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text === "" ? undefined : safeParse(text);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * GET arguments travel in the query string, so the object the caller passes to
 * `useQuery` is encoded rather than sent. POST bodies stay as JSON.
 */
function queryString(args: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s === "" ? "" : `?${s}`;
}

/* -------------------------------------------------------------------------
 * A tiny observable query cache
 *
 * Convex kept the server's state live for every component at once. Rather than
 * reimplement that over polling, components share one cache: a mutation clears
 * it, every mounted query notices and refetches. That keeps a single source of
 * truth, so the map, the list and the stats tiles can never disagree about
 * what is in the log.
 * ---------------------------------------------------------------------- */

type Entry = { data: unknown; loaded: boolean; error?: unknown };

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const inFlight = new Set<string>();

/** Bumped whenever the cache changes; read through `useSyncExternalStore`. */
let revision = 0;
function getRevision(): number {
  return revision;
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function publish(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function setEntry(key: string, entry: Entry): void {
  cache.set(key, entry);
  publish();
}

/**
 * Bumped only when the whole cache is dropped, and part of every cache key.
 *
 * It has to be part of the key, not merely a signal: a query's effect depends
 * on its key, so without it a cleared cache would leave every mounted query
 * showing `undefined` with nothing to restart it — a spinner that never ends.
 *
 * It is deliberately separate from `revision`, which changes whenever any entry
 * lands: if a completed fetch changed the keys too, every other in-flight query
 * would restart itself and the two would never settle.
 */
let generation = 0;

/**
 * Drops every cached result.
 *
 * Cleared wholesale rather than per-key because it is not knowable here which
 * queries a given mutation affects: deleting a flight changes the list, the
 * stats, and every trip's flight count. Refetching all of them is a few
 * hundred bytes each and happens on an explicit user action.
 */
export function invalidateQueries(): void {
  generation += 1;
  cache.clear();
  publish();
}

async function loadInto<T>(key: string, method: "GET" | "POST", path: string, body?: unknown): Promise<void> {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const data = await request<T>(method, path, body);
    // The cache may have been cleared while this was in flight; writing the
    // result back is still correct, since it is the freshest answer for `key`.
    setEntry(key, { data, loaded: true });
  } catch (error) {
    // Recorded rather than thrown: a query that fails should not take the page
    // down, and the components already render an empty state for `undefined`.
    setEntry(key, { data: undefined, loaded: true, error });
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Run a query, returning `undefined` until it has an answer.
 *
 * `"skip"` is the same sentinel Convex used, and has the same meaning: do not
 * run this yet. The result stays on screen while a background refresh is in
 * flight, so a poll never makes the map flash empty.
 */
export function useQuery<TArgs, TResult>(
  ref: Endpoint<TArgs, TResult>,
  args?: TArgs | "skip",
): TResult | undefined {
  const skipped = args === "skip";
  const concreteArgs = args === "skip" ? {} : (args ?? {});

  // Subscribing is what repaints this component when a mutation elsewhere
  // clears the cache; the snapshot itself is not needed here, only the change.
  useSyncExternalStore(subscribe, getRevision, getRevision);

  const key = skipped ? null : `${generation} ${cacheKey(ref, concreteArgs)}`;
  const qs = skipped ? "" : queryString(concreteArgs);
  const entry = key === null ? undefined : cache.get(key);
  const data = entry?.loaded ? (entry.data as TResult) : undefined;

  useEffect(() => {
    if (key === null || cache.has(key) || inFlight.has(key)) return;
    void loadInto<TResult>(key, ref.method, ref.path + qs);
  }, [key, ref, qs]);

  return data;
}

function cacheKey(ref: Endpoint<unknown, unknown>, args: object): string {
  return `${ref.method} ${ref.path} ${JSON.stringify(args, Object.keys(args).sort())}`;
}

/**
 * Returns a function that calls the endpoint, and throws on failure.
 *
 * Throwing — rather than returning a result object — is what the components
 * already expect: `addFlight` catches and inspects the message to detect the
 * `ALREADY_LOGGED:` duplicate signal, and every other panel does
 * `catch (e) { setError(e.message) }`.
 */
export function useMutation<TArgs, TResult>(
  ref: Endpoint<TArgs, TResult>,
): (args: TArgs) => Promise<TResult> {
  const stable = useCallback(
    async (args: TArgs): Promise<TResult> => {
      const result = await request<TResult>(ref.method, ref.path, args);
      // The server is the source of truth and the cache is now stale.
      invalidateQueries();
      return result;
    },
    [ref],
  );
  return stable;
}

/**
 * Polls while queries are mounted.
 *
 * This is what replaces Convex's push updates. The interval is deliberately
 * unhurried: nothing in this app is written by anyone but the user sitting in
 * front of it, who already gets an immediate refetch from `invalidateQueries`.
 * The poll exists so a second tab — or a reload after an edit elsewhere —
 * converges without a manual refresh.
 */
const POLL_INTERVAL_MS = 20_000;

export function useQueryPolling(): void {
  useEffect(() => {
    const id = setInterval(() => {
      if (cache.size > 0) invalidateQueries();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
