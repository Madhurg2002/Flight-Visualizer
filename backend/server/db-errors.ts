/**
 * Turning database failures into something you can act on.
 *
 * The client is only ever told "something went wrong", on purpose: an
 * unexpected error's message usually contains a query, a column name or a file
 * path. That is the right default, but it makes a misconfigured database the
 * single hardest thing to diagnose — the server log is the only place the real
 * reason appears, and on a serverless host that log scrolls away.
 *
 * A SQLSTATE is a stable, enumerable code. It says precisely what went wrong
 * without leaking anything, so these cases are recognised and answered with the
 * one thing the reader needs to do next. Everything else still gets the
 * generic message.
 */

/** An error carrying a Postgres SQLSTATE, whichever driver produced it. */
type CodedError = { code?: unknown; message?: unknown };

function sqlStateOf(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const { code, message } = error as CodedError;

  // Drivers disagree: some put the state on `.code`, some wrap it in the
  // message, and some report a number.
  if (typeof code === "string") {
    const trimmed = code.trim();
    if (/^[0-9A-Z]{5}$/.test(trimmed)) return trimmed;
    const found = /([0-9][0-9A-Z]{4})/.exec(trimmed);
    if (found?.[1]) return found[1];
  }
  if (typeof message === "string") {
    const found = /\b([0-9][0-9A-Z]{4})\b/.exec(message);
    if (found?.[1]) return found[1];
  }
  return "";
}

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && typeof (error as CodedError).message === "string") {
    return (error as CodedError).message as string;
  }
  return "";
}

export type DatabaseDiagnosis = {
  /** What went wrong, in one line. */
  summary: string;
  /** What to do about it, or null when there is nothing actionable to say. */
  remedy: string | null;
};

/**
 * Recognises the ways a Postgres connection commonly fails.
 *
 * Returns null for anything it does not recognise, so the caller keeps its
 * generic message rather than guessing.
 */
export function diagnoseDatabaseError(error: unknown): DatabaseDiagnosis | null {
  const state = sqlStateOf(error);
  const message = messageOf(error);

  // 3D000 — the database named in the connection string does not exist.
  if (state === "3D000" || /database .* does not exist/i.test(message)) {
    return {
      summary: "The database named in DATABASE_URL does not exist.",
      remedy: "Check the connection string, and create the database if it is new.",
    };
  }

  // 28P01 / 28000 — wrong password, or the role cannot log in.
  if (state === "28P01" || state === "28000" || /password authentication failed/i.test(message)) {
    return {
      summary: "Postgres rejected the credentials in DATABASE_URL.",
      remedy: "Check the user and password, and that the connection string is URL-encoded.",
    };
  }

  // 42P01 — the connection works, but the schema was never applied. This is the
  // one you hit after a migration: everything reports healthy until a request
  // actually reads a table.
  if (state === "42P01" || /relation ".*" does not exist/i.test(message)) {
    return {
      summary: "The database is reachable but the tables have not been created.",
      remedy: "Run `bun run db:push` against the same DATABASE_URL to create them.",
    };
  }

  // 42703 / 42P07 — the tables exist but from an older or newer schema. A
  // deployment that forgot to run a migration looks exactly like this.
  if (state === "42703" || state === "42P07") {
    return {
      summary: "The database schema does not match this version of the app.",
      remedy: "Run `bun run db:push` to bring the schema up to date.",
    };
  }

  // Cannot reach the database at all: DNS, TLS, a firewall, a suspended branch.
  if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|getaddrinfo/i.test(message) ||
    state === "08000" ||
    state === "08003" ||
    state === "08006"
  ) {
    return {
      summary: "The database could not be reached.",
      remedy: "Check DATABASE_URL, and that the database project is not suspended.",
    };
  }

  return null;
}
