import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration.
 *
 * Used only for `db:generate` (write migration SQL) and `db:push` (apply it).
 * The running API never reads this file — it goes through the Drizzle client
 * in `db/client.ts` — so a deployed function has no migration tooling in its
 * bundle.
 *
 * `dbCredentials.url` is read from the environment rather than committed. There
 * is no default: a migration that silently ran against a local database would
 * be a confusing way to find out you had not set it.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.warn(
    "DATABASE_URL is not set — `db:generate` will write SQL but `db:push` will not connect.",
  );
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: url ?? "" },
  strict: true,
  verbose: true,
});
