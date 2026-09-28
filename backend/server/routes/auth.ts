import { getDb } from "../../db/client.ts";
import { users } from "../../db/schema.ts";
import {
  UserError,
  clearedSessionCookie,
  readJson,
  sessionCookie,
  str,
} from "../http.ts";
import { isCrossOriginMode } from "../cors.ts";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "../password.ts";
import { createSession, revokeSession, type Ctx } from "../session.ts";

/**
 * The password sign-up / sign-in flows, replacing Convex Auth.
 *
 * Sign-up and sign-in stay separate on purpose. A wrong password and an
 * existing account are reported the same way by the UI, so quietly falling
 * back from one flow to the other would turn "wrong password" into a confusing
 * "that account already exists".
 */

/**
 * A real hash of a password nobody has, used to keep the "no such user" path as
 * slow as the "wrong password" one. The value is irrelevant — it is never
 * matched by a correct guess — but its *shape* must be a valid scrypt hash or
 * `verifyPassword` would return early without doing any work.
 */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** `SameSite=Lax` is only meaningful over TLS, so send `Secure` when we have it. */
function useSecureCookies(ctx: Ctx): boolean {
  const proto = ctx.req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim() === "https";
  return ctx.url.protocol === "https:";
}

function normaliseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  // Deliberately permissive: the only real test of an address is whether mail
  // arrives at it. Anything stricter rejects valid addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("Enter a valid email address");
  if (email.length > 254) throw new UserError("That email address is too long");
  return email;
}

function readCredentials(body: Record<string, unknown>): { email: string; password: string } {
  const email = normaliseEmail(str(body.email, "email"));
  const password = str(body.password, "password");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UserError(`Pick a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > 200) throw new UserError("That password is too long");
  return { email, password };
}

async function startSession(ctx: Ctx, userId: string, email: string): Promise<{ email: string }> {
  const token = await createSession(userId);
  // Cross-site when a separate frontend origin is configured, which is what
  // makes the browser send the cookie back at all.
  ctx.setCookies.push(sessionCookie(token, useSecureCookies(ctx), isCrossOriginMode()));
  return { email };
}

export async function signUp(ctx: Ctx): Promise<{ email: string }> {
  const body = await readJson<Record<string, unknown>>(ctx.req);
  const { email, password } = readCredentials(body);

  const db = getDb();
  // Enforced by the unique index on lower(email), so two simultaneous sign-ups
  // cannot both get past this check and then one loses on insert.
  const existing = await db.query.users.findFirst({ where: (u, { sql: s }) => s`lower(${u.email}) = ${email}` });
  if (existing) throw new UserError("An account already exists for that email. Try signing in.", 409);

  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email, passwordHash: await hashPassword(password), createdAt: Date.now() });

  return startSession(ctx, id, email);
}

export async function signIn(ctx: Ctx): Promise<{ email: string }> {
  const body = await readJson<Record<string, unknown>>(ctx.req);
  const email = normaliseEmail(str(body.email, "email"));
  const password = str(body.password, "password");

  const user = await getDb().query.users.findFirst({
    where: (u, { sql: s }) => s`lower(${u.email}) = ${email}`,
  });

  // Hash even when the user does not exist, so a wrong email and a wrong
  // password take the same time and cannot be told apart by timing.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new UserError("That email and password do not match an account.", 401);

  return startSession(ctx, user.id, user.email);
}

export async function signOut(ctx: Ctx): Promise<void> {
  await revokeSession(ctx.req);
  ctx.setCookies.push(clearedSessionCookie(useSecureCookies(ctx), isCrossOriginMode()));
}

/**
 * Identity for the header: the signed-in email, or null.
 *
 * Returns null rather than failing when signed out, because the dashboard asks
 * this on every load and a 401 there would be indistinguishable from a broken
 * deployment.
 */
export function me(ctx: Ctx): string | null {
  return ctx.user?.email ?? null;
}
