import { createServer } from "node:http";
import { handleRequest } from "./router.ts";
import { sendWebResponse, toWebRequest, type NodeRequest, type NodeResponse } from "./node-adapter.ts";

/**
 * The API as a long-running server, on Node.
 *
 * `start` points here rather than at `server/dev.ts` because that one uses
 * `Bun.serve`, which only exists under Bun. Vercel and the Node-based hosts
 * give you Node, so the production entry point has to be Node. The routes are
 * the same in every case — only the few lines below this one differ.
 *
 * Reads `PORT` and then `API_PORT`, because hosts disagree about which they
 * inject, and binds `0.0.0.0` because binding localhost makes a container
 * unreachable from outside it.
 */
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3210);

const server = createServer((req, res) => {
  void (async () => {
    try {
      const response = await handleRequest(await toWebRequest(req as NodeRequest));
      await sendWebResponse(res as NodeResponse, response);
    } catch (error) {
      // The router turns expected failures into responses; reaching here means
      // the adapter itself failed, so there is nothing left to route to.
      console.error("Unhandled request failure", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify({ error: "Something went wrong. Please try again." }));
    }
  })();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});

// Shut down cleanly so a deploy or a restart does not cut a request in half.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
