import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

/**
 * The Postgres connection.
 *
 * `neon-http` speaks Postgres over HTTP rather than holding a TCP socket open,
 * which is what makes this work on a serverless function: there is no
 * connection to keep alive, and a function that sleeps between requests costs
 * nothing. Neon scales the compute to zero when the database is idle.
 *
 * The client is built on first use rather than at import time. The API process
 * should be able to boot and answer `/api/health` on a machine with no
 * `DATABASE_URL` — reporting a clear error on the first query is far easier to
 * diagnose than a module-load crash on a platform that only shows you the
 * container log.
 */
type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;
let override: Database | null = null;

/**
 * Points the app at a database other than `DATABASE_URL`.
 *
 * This exists for `scripts/check-api.ts`, which runs the real route handlers
 * against an in-process Postgres so the SQL is covered without a server or a
 * connection string. Nothing in the application calls it, and it is deliberately
 * not configurable from the environment: a mis-set variable must not be able to
 * redirect where a user's flight log is read from.
 */
export function setDbOverride(db: Database | null): void {
  override = db;
}

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Point it at a Postgres connection string, then run `bun run db:push` to create the tables.",
    );
    this.name = "MissingDatabaseUrlError";
  }
}

export function getDb(): Database {
  if (override) return override;
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MissingDatabaseUrlError();

  cached = drizzle(neon(connectionString), { schema });
  return cached;
}

/** Whether the API can reach a database at all, for `/api/health`. */
export function isDatabaseConfigured(): boolean {
  return override !== null || Boolean(process.env.DATABASE_URL);
}

/**
 * Asks the database whether it is actually usable.
 *
 * `/api/health` used to report `configured` on the strength of a variable
 * existing, which is the most misleading thing a health check can say: it
 * stayed green with a connection string pointing at a database with no tables
 * in it, so the first sign of trouble was a 500 on the first real request.
 *
 * `select 1` is one round trip, and on Neon's HTTP driver it costs nothing
 * when the database is asleep.
 *
 * The success case declares `error` as well, which looks redundant and is not.
 * Narrowing a union by a boolean discriminant needs `strictNullChecks`, and
 * TypeScript only turns that on in the repository's own config. The function
 * that builds the Vercel deployment compiles this file with its own defaults,
 * where `ok: true` narrows to nothing at all and reading `.error` is a type
 * error. Declaring the property on both arms makes the read legal under any
 * setting, so the same source type-checks wherever it is built.
 */
export async function probeDatabase(): Promise<{ ok: true; error?: undefined } | { ok: false; error: unknown }> {
  try {
    await getDb().execute("select 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
