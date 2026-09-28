import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Node ↔ Fetch adapter.
 *
 * The routes are written against WHATWG `Request`/`Response` so the same
 * implementation runs under Bun in development and under Node in production.
 * Node hands us the older `IncomingMessage`/`ServerResponse` pair instead, and
 * this is the only file that knows about that difference.
 *
 * It lives beside the routes rather than in `api/` because there are two Node
 * entry points — the serverless function and the long-running server — and
 * neither should be the one that owns shared plumbing.
 *
 * The types are spelled out rather than imported from `@vercel/node` so the
 * repository does not need Vercel's package to typecheck or build.
 */

export type NodeRequest = IncomingMessage & {
  /** Parsed by the platform when the content type is JSON; a raw string otherwise. */
  body?: unknown;
  query?: Record<string, string | string[]>;
};

export type NodeResponse = ServerResponse & {
  status: (code: number) => NodeResponse;
  json: (body: unknown) => void;
  send: (body: string) => void;
};

export function toWebRequest(req: NodeRequest): Request {
  // A platform may pass an absolute URL and a host header that disagree, so the
  // header is the fallback rather than the source.
  const base = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const url = req.url?.startsWith("http") ? new URL(req.url) : base;

  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }

  // The body has usually already been consumed and parsed by the time it
  // reaches us, so it has to be put back. Only GET and HEAD may be bodyless.
  let body: string | undefined;
  if (req.body !== undefined && req.body !== null && req.method !== "GET" && req.method !== "HEAD") {
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  return new Request(url, { method: req.method ?? "GET", headers, body });
}

export async function sendWebResponse(res: NodeResponse, response: Response): Promise<void> {
  res.status(response.status);

  // `getSetCookie` returns one entry per cookie. Assigning `set-cookie` directly
  // would collapse them into one comma-joined string, which browsers misparse.
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === "set-cookie") continue;
    res.setHeader(key, value);
  }
  if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);

  const text = await response.text();
  res.end(text === "" ? undefined : text);
}
