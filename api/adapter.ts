/**
 * Re-exported so `api/[...path].ts` reads as a single thin entry point.
 *
 * The adapter itself lives in `backend/server/` beside the routes it adapts,
 * because the long-running Node server uses the same code.
 */
export { sendWebResponse, toWebRequest } from "../backend/server/node-adapter.ts";
export type { NodeRequest, NodeResponse } from "../backend/server/node-adapter.ts";
