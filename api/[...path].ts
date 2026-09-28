import { sendWebResponse, toWebRequest } from "./adapter.ts";
import { handleRequest } from "../backend/server/router.ts";

/**
 * The production API: a single Vercel function that serves every `/api/*` route.
 *
 * The bracketed catch-all filename Vercel requires makes `/api/flights`,
 * `/api/resolve` and `/api/health` all land here, and they are dispatched by
 * the same routing table the development server uses. Frontend and API
 * therefore share one origin, which is why the session cookie is a plain
 * same-origin cookie and the client never has to be told where the API lives.
 */
export default async function handler(req: unknown, res: unknown): Promise<void> {
  const request = toWebRequest(req as Parameters<typeof toWebRequest>[0]);
  const response = await handleRequest(request);
  await sendWebResponse(res as Parameters<typeof sendWebResponse>[0], response);
}
