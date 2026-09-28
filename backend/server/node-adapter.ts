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

/**
 * Deliberately just Node's `ServerResponse`.
 *
 * An earlier version declared Express's `status()`, `json()` and `send()` here
 * to make the adapter's own calls typecheck. They do not exist on a Node
 * response, so the server bound its port and then answered every request with
 * a 500 — and typecheck was happy, because the type had declared the fiction.
 * The type is now exactly what Node gives us, so a missing method is a
 * compile error rather than a runtime one.
 */
export type NodeResponse = ServerResponse;

export async function toWebRequest(req: NodeRequest): Promise<Request> {
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

  const method = req.method ?? "GET";
  const bodyless = method === "GET" || method === "HEAD";

  // Two different worlds reach this function. A serverless platform parses the
  // body for us and hands it over as `req.body`. Plain Node does not: the
  // request is still an unread stream, and `req.body` is simply undefined.
  //
  // Reading only the first case is a trap that typechecks and deploys happily,
  // and then every POST arrives empty — so sign-in, saving a flight and bulk
  // import all fail on a plain Node host while working on the platform that
  // hides the difference. Both cases are handled here.
  let body: string | undefined;
  if (!bodyless) {
    if (req.body !== undefined && req.body !== null) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    } else if (typeof req.on === "function") {
      body = await readStream(req);
    }
    // Otherwise there is no stream to read and no parsed body: a genuinely
    // empty request. `readJson` turns that into `{}` and the route answers
    // with a proper validation error, which is what an empty POST deserves.
    // Throwing here would turn a bad request into a 500.
  }

  return new Request(url, { method, headers, body: body === "" ? undefined : body });
}

/** Collects a Node request stream into a string. */
function readStream(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function sendWebResponse(res: NodeResponse, response: Response): Promise<void> {
  // `statusCode`, not `status()`: the latter is Express, and a plain Node
  // response has no such method.
  res.statusCode = response.status;

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
