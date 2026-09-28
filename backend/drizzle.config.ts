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
 *
 * `strict` is false, and that is load-bearing. It means "ask before applying",
 * unconditionally — so on a host, where there is no terminal, `db:push` builds
 * the whole schema, prints it, and then dies with "Interactive prompts require
 * a TTY terminal" having applied nothing. That is what a deploy on Render did:
 * every CREATE TABLE right there in the log, followed by the error, and then a
 * database that was still empty. The safety it was bought with is not lost by
 * turning it off, because the guardrail that matters is separate: `--force` is
 * never passed, so a statement that would truncate a table still stops and
 * says so. `strict` only ever added a question nobody could answer.
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
  strict: false,
  verbose: true,
});
