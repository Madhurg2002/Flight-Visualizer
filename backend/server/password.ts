import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing.
 *
 * scrypt from Node's standard library — no dependency, and available
 * identically in Bun and in a Vercel Node runtime. Parameters are stored in the
 * hash string so they can be raised later without invalidating existing
 * passwords: an old hash keeps verifying with the N/r/p it was written with.
 */

// OWASP's recommended scrypt parameters (N=2^17, r=8, p=1) need 128MB of
// memory per hash, which is more than a small serverless function should spend
// on one request. N=2^15 costs 32MB and is the usual choice for that setting;
// the login path is rate-limited by being a single indexed lookup plus this.
const N = 32768;
const r = 8;
const p = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

/** Minimum length the sign-up form enforces, mirrored by the client. */
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallel = Number(parts[3]);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallel)) {
    return false;
  }

  const salt = Buffer.from(parts[4]!, "base64url");
  const expected = Buffer.from(parts[5]!, "base64url");

  let actual: Buffer;
  try {
    actual = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallel,
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }

  // Constant-time: a length check alone leaks how much of a guess was right.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Session tokens are stored hashed; see the `sessions` table comment. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}
