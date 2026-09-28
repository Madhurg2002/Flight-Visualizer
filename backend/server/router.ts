import { HttpError, UserError, json } from "./http.ts";
import { makeCtx, resolveUser, type Ctx } from "./session.ts";
import * as auth from "./routes/auth.ts";
import * as flightRoutes from "./routes/flights.ts";
import * as resolveRoutes from "./routes/resolve.ts";
import * as tripRoutes from "./routes/trips.ts";
import { MissingDatabaseUrlError, isDatabaseConfigured } from "../db/client.ts";

/**
 * The API.
 *
 * One routing table, matched in order, returning a WHATWG `Response`. Both
 * runtimes this ships to speak that natively: `Bun.serve` in development and a
 * Vercel Node function in production, whose entry point adapts Node's
 * `IncomingMessage`/`ServerResponse` and calls straight into `handleRequest`.
 */

type Route = {
  method: "GET" | "POST";
  /** Matched against `pathname` with the `/api` prefix already stripped. */
  path: string;
  /**
   * Whether to look up the caller's session first.
   *
   * True costs one indexed lookup, so it is only paid where the answer changes
   * something. The resolver is one of those: knowing where the user has already
   * been makes its ranking better, and it is still useful signed out, where the
   * lookup simply comes back null. The airport searches are not — they read
   * only the bundled datasets, so they skip it.
   */
  auth: boolean;
  handle: (ctx: Ctx) => Promise<unknown> | unknown;
};

const ROUTES: Route[] = [
  { method: "POST", path: "/auth/signup", auth: false, handle: auth.signUp },
  { method: "POST", path: "/auth/signin", auth: false, handle: auth.signIn },
  { method: "POST", path: "/auth/signout", auth: false, handle: auth.signOut },
  { method: "GET", path: "/users/me", auth: true, handle: auth.me },

  { method: "GET", path: "/flights", auth: true, handle: flightRoutes.listFlights },
  { method: "GET", path: "/flights/get", auth: true, handle: flightRoutes.getFlightByQuery },
  { method: "GET", path: "/flights/stats", auth: true, handle: flightRoutes.flightStats },
  { method: "POST", path: "/flights/add", auth: true, handle: flightRoutes.addFlight },
  { method: "POST", path: "/flights/update", auth: true, handle: flightRoutes.updateFlight },
  { method: "POST", path: "/flights/remove", auth: true, handle: flightRoutes.removeFlight },
  { method: "POST", path: "/flights/importBulk", auth: true, handle: flightRoutes.importBulk },

  { method: "GET", path: "/trips", auth: true, handle: tripRoutes.listTrips },
  { method: "POST", path: "/trips/create", auth: true, handle: tripRoutes.createTrip },
  { method: "POST", path: "/trips/remove", auth: true, handle: tripRoutes.removeTrip },

  { method: "GET", path: "/resolve", auth: true, handle: resolveRoutes.resolveQuery },
  { method: "GET", path: "/airports/search", auth: false, handle: resolveRoutes.searchAirport },
  { method: "GET", path: "/airports/airline", auth: false, handle: resolveRoutes.searchAirline },
  { method: "GET", path: "/airports/lookup", auth: false, handle: resolveRoutes.lookupAirport },
];

function match(method: string, pathname: string): { route: Route } | { allow: string[] } | null {
  const allow = new Set<string>();
  for (const route of ROUTES) {
    if (route.path !== pathname) continue;
    if (route.method === method) return { route };
    allow.add(route.method);
  }
  return allow.size > 0 ? { allow: [...allow] } : null;
}

/**
 * The entry point both runtimes call.
 *
 * Errors are turned into responses here rather than in each route, so a handler
 * can just throw and the client always gets `{ error }` back. Only a
 * `UserError`'s message is passed through: anything else is a bug, and its
 * message is likely to contain a query or a path that has no business being
 * sent to a browser.
 */
export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const health = handleHealth(url, req.method);
  if (health) return health;

  if (!url.pathname.startsWith("/api/")) {
    return json({ error: "Not found" }, { status: 404 });
  }

  const found = match(req.method, url.pathname.slice("/api".length));
  if (!found) return json({ error: "Not found" }, { status: 404 });
  if ("allow" in found) {
    return json({ error: "Method not allowed" }, { status: 405, headers: { allow: found.allow.join(", ") } });
  }

  const ctx = makeCtx(req);
  try {
    // Routes that need to know who is asking get one lookup here; the rest skip
    // it, and a request with no cookie simply resolves to null.
    if (found.route.auth) ctx.user = await resolveUser(req);

    const body = await found.route.handle(ctx);
    const response = body === undefined ? new Response(null, { status: 204 }) : json(body);
    return withCookies(response, ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Liveness, and the first thing to check when the app is not signing anyone in.
 * Reports whether a database is configured *without* touching it, so it stays
 * fast and still works when the connection string is missing.
 */
function handleHealth(url: URL, method: string): Response | null {
  if (url.pathname !== "/api/health") return null;
  if (method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { allow: "GET" } });
  }
  return json({ ok: true, database: isDatabaseConfigured() ? "configured" : "missing" });
}

function withCookies(response: Response, ctx: Ctx): Response {
  if (ctx.setCookies.length === 0) return response;
  // `Headers.append` rather than a plain assignment: a route can set more than
  // one cookie, and assigning would keep only the last.
  const headers = new Headers(response.headers);
  for (const cookie of ctx.setCookies) headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

function errorResponse(error: unknown): Response {
  if (error instanceof UserError) {
    return json({ error: error.message }, { status: error.status });
  }
  if (error instanceof MissingDatabaseUrlError) {
    // A misconfiguration, not a user error: 500, and the message names the
    // variable because this is the only place anyone will see it.
    return json({ error: error.message }, { status: 500 });
  }
  if (error instanceof HttpError) {
    return json({ error: error.message }, { status: error.status });
  }
  console.error("Unhandled API error", error);
  return json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}
