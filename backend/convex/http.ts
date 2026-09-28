import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Handles /.well-known/* plus /api/auth/* for the sign-in flows.
auth.addHttpRoutes(http);

export default http;
