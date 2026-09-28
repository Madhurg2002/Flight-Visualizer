import { ConvexReactClient } from "convex/react";

/**
 * The browser always talks to Convex on the same origin it loaded the app from.
 *
 * In development the Vite server proxies `/api` and `/.well-known` through to
 * the local Convex deployment (see `vite.config.ts`), because a local
 * deployment binds to 127.0.0.1 and is unreachable from the user's browser.
 * In production the app and its Convex deployment sit behind one origin.
 *
 * Either way this is the only place the address is decided, and the value has
 * to be absolute — ConvexReactClient rejects a relative URL.
 */
const convexUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : import.meta.env.VITE_CONVEX_URL ?? "http://127.0.0.1:3210";

export const convex = new ConvexReactClient(convexUrl);
