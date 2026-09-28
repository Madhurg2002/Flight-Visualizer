/**
 * Cross-origin support, for a frontend and API on different hosts.
 *
 * The frontend is on Vercel and the API on Render, so every request is
 * cross-site. That has three consequences, all of which have to be right or
 * sign-in silently does nothing:
 *
 * 1. The browser needs permission to read the response, so every response —
 *    not just the preflight — carries `Access-Control-Allow-Origin`.
 * 2. `Access-Control-Allow-Origin: *` is **invalid** once credentials are
 *    involved, which they are, because the session is a cookie. The header has
 *    to name the exact origin.
 * 3. A `SameSite=Lax` cookie is never sent on a cross-site request, so the
 *    session cookie has to become `SameSite=None; Secure`.
 *
 * The allowed origins are an explicit list, not a pattern. That is what stops
 * any other site on the internet from reading this user's flight log with their
 * session, which is the whole reason the origin is checked rather than
 * reflected back.
 */

/** Header the client must send on state-changing requests. See `isBlockedByCsrf`. */
export const CSRF_HEADER = "x-skytrace-client";

/** The value that must accompany {@link CSRF_HEADER}. */
export const CSRF_VALUE = "1";

let cached: { raw: string | undefined; origins: Set<string> } | null = null;

function configured(): { raw: string | undefined; origins: Set<string> } {
  if (cached) return cached;
  const raw = process.env.ALLOWED_ORIGINS;
  const origins = new Set<string>();
  for (const entry of (raw ?? "").split(",")) {
    const trimmed = entry.trim().replace(/\/+$/, "");
    // A wildcard is refused outright rather than honoured: it would re-open
    // exactly the hole the allowlist exists to close, and someone would set it
    // while trying to be helpful.
    if (trimmed === "*") {
      console.warn("ALLOWED_ORIGINS contains '*', which is not allowed. Ignoring it.");
      continue;
    }
    if (trimmed !== "") origins.add(trimmed);
  }
  cached = { raw, origins };
  return cached;
}

/** Clears the cached list. Only for tests, which change the environment. */
export function resetCorsCache(): void {
  cached = null;
}

/** Whether any cross-origin frontend is expected at all. */
export function isCrossOriginMode(): boolean {
  return configured().origins.size > 0;
}

/**
 * Whether this browser origin may talk to the API.
 *
 * A request with no `Origin` header is same-origin, or is not a browser at all
 * — curl, a health check, a server-to-server call. Those are not restricted,
 * because there is no ambient authority for a hostile page to borrow.
 */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  return configured().origins.has(origin.replace(/\/+$/, ""));
}

/**
 * Adds the CORS headers to a response, if the origin is allowed.
 *
 * `Vary: Origin` is not optional. A CDN sits in front of this API and would
 * otherwise cache a response carrying one origin's `Access-Control-Allow-Origin`
 * and hand it to another browser — which fails in a way that looks like a
 * random, intermittent sign-in bug.
 */
export function withCors(req: Request, headers: Headers): Headers {
  const origin = req.headers.get("origin");
  // Always vary, whether or not this particular request is allowed: a
  // disallowed origin must not be able to be served a cached allowed response.
  headers.append("vary", "Origin");

  if (origin === null) return headers;
  if (!isAllowedOrigin(req)) return headers;

  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  return headers;
}

/**
 * Blocks a cross-site state change that did not come from this app.
 *
 * Allowing credentialed cross-origin requests means any site can *send* a
 * request with the user's cookie attached; the allowlist stops it from
 * *reading* the answer, but not from writing. That is ordinary CSRF, and the
 * defence is that every write carries this header. A custom header forces a
 * preflight, and a preflight cannot be sent by a plain form or an image tag —
 * so only JavaScript that went through this app's CORS check can produce it.
 *
 * The same-origin case is not restricted: there is no other origin to be
 * hostile from.
 */
export function isBlockedByCsrf(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD") return false;
  if (req.headers.get("origin") === null) return false;
  return req.headers.get(CSRF_HEADER) !== CSRF_VALUE;
}
