import { sendWebResponse, toWebRequest } from "../backend/server/node-adapter.ts";
import { handleRequest } from "../backend/server/router.ts";

/**
 * The production API: a single Vercel function that serves every `/api/*` route.
 *
 * The bracketed catch-all filename Vercel requires makes `/api/flights`,
 * `/api/resolve` and `/api/health` all land here, and they are dispatched by
 * the same routing table the development server uses, so the frontend and the
 * API can share one origin and the session cookie stays same-origin.
 *
 * This is also the only file in `api/`, and it has to stay that way. Vercel
 * builds *every* file in this directory as its own serverless function, so a
 * helper module placed here — which is what the re-export shim used to be —
 * fails the build for having no default export. Shared plumbing lives in
 * `backend/server/`, which is where the long-running Node server reads it from
 * too.
 */
export default async function handler(req: unknown, res: unknown): Promise<void> {
  const request = await toWebRequest(req as Parameters<typeof toWebRequest>[0]);
  const response = await handleRequest(request);
  await sendWebResponse(res as Parameters<typeof sendWebResponse>[0], response);
}
