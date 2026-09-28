/**
 * The small HTTP layer the routes are written against.
 *
 * Handlers take and return WHATWG `Request`/`Response`, which both runtimes this
 * API targets speak natively: Bun's `Bun.serve` in development and a Vercel
 * function in production. Keeping the handlers runtime-agnostic means there is
 * exactly one implementation of every route, and no Express.
 */

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * An error the user caused — a bad date, an unknown airport, a wrong password.
 *
 * The message is safe to show verbatim. Anything else is reported to the client
 * as a generic failure, because an unexpected error's message usually contains
 * a column name, a file path, or part of a query.
 */
export class UserError extends HttpError {
  constructor(message: string, status = 400) {
    super(status, message);
    this.name = "UserError";
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** Reads a JSON body, treating a malformed one as a user error. */
export async function readJson<T>(req: Request): Promise<T> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new UserError("Could not read the request body");
  }
  if (text === "") return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UserError("Malformed JSON");
  }
}

/** Reads a string argument, rejecting anything that is not a string. */
export function str(value: unknown, field: string): string {
  if (typeof value !== "string") throw new UserError(`${field} must be a string`);
  return value;
}

export function optStr(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new UserError("Expected a string");
  return value;
}

export function num(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UserError(`${field} must be a number`);
  }
  return value;
}

export function optNum(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return num(value, field);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  // Guards against values that match the shape but are not real dates, e.g.
  // "2025-02-31", which Postgres would reject with an opaque error.
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === "") continue;
    out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export const SESSION_COOKIE = "skytrace_session";

/** 30 days, sliding: every sign-in that uses the cookie extends it. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The session cookie.
 *
 * `Lax` in the single-origin case, which is the tighter setting: the cookie is
 * not attached to a request initiated by another site.
 *
 * `None` when a cross-origin frontend is configured, because `Lax` is *never*
 * sent on a cross-site request — which would mean sign-in appearing to succeed
 * and then every later request coming back anonymous. `None` obliges `Secure`,
 * so this can only ever be used over HTTPS, which is a property worth having
 * rather than a restriction.
 */
export function sessionCookie(token: string, secure: boolean, crossOrigin: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    crossOrigin ? "SameSite=None" : "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure || crossOrigin) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearedSessionCookie(secure: boolean, crossOrigin: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    crossOrigin ? "SameSite=None" : "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure || crossOrigin) attrs.push("Secure");
  return attrs.join("; ");
}
