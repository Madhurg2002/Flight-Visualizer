import { eq, lt } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { sessions, type UserRow } from "../db/schema.ts";
import { generateToken, hashToken } from "./password.ts";
import { UserError, parseCookies, SESSION_COOKIE, SESSION_TTL_MS } from "./http.ts";

/**
 * Who is making this request.
 *
 * Resolved once per request in the router and passed to every route, so a
 * handler never has to parse the cookie itself and no route can accidentally
 * skip the ownership check.
 */
export type Ctx = {
  req: Request;
  url: URL;
  user: UserRow | null;
  /** Set by the sign-in routes; turned into a `Set-Cookie` by the router. */
  setCookies: string[];
};

export function makeCtx(req: Request): Ctx {
  return { req, url: new URL(req.url), user: null, setCookies: [] };
}

/**
 * The signed-in user, or null.
 *
 * A missing, unknown or expired cookie is all the same thing to every caller:
 * signed out. Expired rows are deleted on the way past rather than left to
 * accumulate.
 */
export async function resolveUser(req: Request): Promise<UserRow | null> {
  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (!token) return null;

  const db = getDb();
  const tokenHash = hashToken(token);
  const now = Date.now();

  const row = await db.query.sessions.findFirst({ where: (s, { eq: e }) => e(s.tokenHash, tokenHash) });
  if (!row) return null;

  if (row.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }

  // Slide the expiry, so an active user is not signed out mid-session. Only
  // write when the window is more than half gone, to keep this off the hot path.
  if (row.expiresAt - now < SESSION_TTL_MS / 2) {
    await db
      .update(sessions)
      .set({ expiresAt: now + SESSION_TTL_MS })
      .where(eq(sessions.tokenHash, tokenHash));
  }

  const user = await db.query.users.findFirst({ where: (u, { eq: e }) => e(u.id, row.userId) });
  return user ?? null;
}

/** For routes that only make sense signed in. */
export function requireUser(ctx: Ctx): UserRow {
  if (!ctx.user) throw new UserError("Not signed in", 401);
  return ctx.user;
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = generateToken();
  const now = Date.now();

  // Opportunistic cleanup: sessions are only removed when they are used, and a
  // user who never returns would otherwise leave rows behind forever.
  await db.delete(sessions).where(lt(sessions.expiresAt, now));

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: now + SESSION_TTL_MS,
    createdAt: now,
  });

  return token;
}

export async function revokeSession(req: Request): Promise<void> {
  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (!token) return;
  await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
