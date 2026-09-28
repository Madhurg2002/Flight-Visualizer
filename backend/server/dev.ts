import { handleRequest } from "./router.ts";

/**
 * The API in development.
 *
 * `handleRequest` is already written against WHATWG `Request`/`Response`, so
 * this is the entire server: Bun.serve adapts them and nothing else is needed.
 * In production the same `handleRequest` is reached through the Vercel
 * function's Node adapter instead.
 *
 * Binds 0.0.0.0 so it is reachable from outside the container, which is what
 * the preview and the Vite proxy both need.
 */
const port = Number(process.env.API_PORT ?? 3210);

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: handleRequest,
});

console.log(`API listening on http://${server.hostname}:${server.port}`);
