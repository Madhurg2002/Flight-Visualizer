import { HttpError, UserError, json } from "./http.ts";
import { makeCtx, resolveUser, type Ctx } from "./session.ts";
import * as auth from "./routes/auth.ts";
import * as flightRoutes from "./routes/flights.ts";
import * as resolveRoutes from "./routes/resolve.ts";
import * as tripRoutes from "./routes/trips.ts";
import { MissingDatabaseUrlError, isDatabaseConfigured, probeDatabase } from "../db/client.ts";
import { diagnoseDatabaseError } from "./db-errors.ts";
import { CSRF_HEADER, isAllowedOrigin, isBlockedByCsrf, withCors } from "./cors.ts";

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
    return preflight(req);
  }

  const health = await handleHealth(url, req.method);
  if (health) return finish(req, health, null);

  if (!url.pathname.startsWith("/api/")) {
    return finish(req, json({ error: "Not found" }, { status: 404 }), null);
  }

  const found = match(req.method, url.pathname.slice("/api".length));
  if (!found) return finish(req, json({ error: "Not found" }, { status: 404 }), null);
  if ("allow" in found) {
    return finish(
      req,
      json({ error: "Method not allowed" }, { status: 405, headers: { allow: found.allow.join(", ") } }),
      null,
    );
  }

  // A write from another site that did not come from this app. Checked before
  // any work, so a hostile page cannot make the server touch the database.
  if (isBlockedByCsrf(req)) {
    return finish(
      req,
      json({ error: "Blocked: cross-origin request is missing the client header." }, { status: 403 }),
      null,
    );
  }

  const ctx = makeCtx(req);
  try {
    // Routes that need to know who is asking get one lookup here; the rest skip
    // it, and a request with no cookie simply resolves to null.
    if (found.route.auth) ctx.user = await resolveUser(req);

    const body = await found.route.handle(ctx);
    const response = body === undefined ? new Response(null, { status: 204 }) : json(body);
    return finish(req, response, ctx);
  } catch (error) {
    return finish(req, errorResponse(error), null);
  }
}

/**
 * The single exit point for every response.
 *
 * CORS headers go on *every* response, not just the preflight. A browser
 * enforces the preflight before it will even send the real request, but the
 * real request's own response still has to say who may read it — putting the
 * header only on the OPTIONS reply is the classic way to end up with a
 * preflight that passes and a response the browser throws away.
 */
function finish(req: Request, response: Response, ctx: Ctx | null): Response {
  const headers = new Headers(response.headers);
  if (ctx) for (const cookie of ctx.setCookies) headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    headers: withCors(req, headers),
  });
}

/**
 * The preflight reply, which advertises what the browser is allowed to send.
 *
 * A disallowed origin gets a 403 rather than a bare 204: the browser would
 * block the response either way, but a 403 is legible in a network log, where
 * an empty 204 looks like a server that is merely slow.
 */
function preflight(req: Request): Response {
  const originSent = req.headers.get("origin") !== null;
  if (originSent && !isAllowedOrigin(req)) {
    return new Response(null, { status: 403, headers: new Headers({ vary: "Origin" }) });
  }

  const headers = withCors(req, new Headers());
  if (originSent) {
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    headers.set("access-control-allow-headers", `content-type, ${CSRF_HEADER}`);
    headers.set("access-control-max-age", "600");
  }
  return new Response(null, { status: 204, headers });
}

/**
 * Liveness, and the first thing to check when the app is not signing anyone in.
 *
 * It actually talks to the database. Reporting "configured" from the presence
 * of a variable was worse than reporting nothing: it stayed green against a
 * database that had no tables, so the first sign of trouble was a 500 on the
 * first real request. One round trip is a cheap price for knowing.
 */
async function handleHealth(url: URL, method: string): Promise<Response | null> {
  if (url.pathname !== "/api/health") return null;
  if (method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { allow: "GET" } });
  }

  if (!isDatabaseConfigured()) {
    return json({ ok: true, database: "missing", remedy: "Set DATABASE_URL." });
  }

  const probe = await probeDatabase();
  if (probe.ok) return json({ ok: true, database: "ready" });

  const diagnosis = diagnoseDatabaseError(probe.error);
  return json(
    {
      ok: true,
      database: diagnosis?.summary.startsWith("The database is reachable") ? "no-tables" : "unreachable",
      problem: diagnosis?.summary ?? "The database could not be reached.",
      ...(diagnosis?.remedy ? { remedy: diagnosis.remedy } : {}),
    },
    { status: 503 },
  );
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
  // A database that is unreachable, has no tables, or is a version behind is a
  // deployment problem with one obvious fix, and it is the hardest kind of
  // failure to diagnose from a generic 500 plus a log that has already scrolled
  // away. Recognised by SQLSTATE, so nothing about the connection is revealed.
  const diagnosis = diagnoseDatabaseError(error);
  if (diagnosis) {
    return json({ error: `${diagnosis.summary} ${diagnosis.remedy}` }, { status: 503 });
  }
  console.error("Unhandled API error", error);
  return json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

