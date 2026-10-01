import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { setDbOverride } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { handleRequest } from "../server/router.ts";

/**
 * API checks, against a real Postgres.
 *
 * PGlite is Postgres compiled to run in-process, so these exercise the actual
 * SQL — the indexes, the enum coercion, the foreign keys, `on delete` — rather
 * than a stub that agrees with whatever the code happens to do. It needs no
 * container and no connection string, which means the database half of this
 * project is covered on every run, including in CI where nobody has a
 * `DATABASE_URL` to hand.
 *
 * The schema is built here by walking Drizzle's own table definitions, so a
 * column added to `db/schema.ts` is created here too and these checks cannot
 * drift away from the real schema.
 *
 * Run with `bun run check:api`.
 */

/* ------------------------------------------------------------------ harness */

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`ok   ${name}`);
    return;
  }
  failures.push(name);
  console.log(`FAIL ${name}${detail === undefined ? "" : ` — got ${JSON.stringify(detail)}`}`);
}

function equal<T>(name: string, actual: T, expected: T): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, same, same ? undefined : { actual, expected });
}

/* ------------------------------------------------------------------- schema */

/** The Postgres base types these tables use. */
const SQL_TYPES: Record<string, string> = {
  text: "text",
  varchar: "varchar",
  integer: "integer",
  real: "real",
  "double precision": "double precision",
  bigint: "bigint",
  date: "date",
  numeric: "numeric",
  boolean: "boolean",
  timestamp: "timestamp",
};

/**
 * Drizzle reports a base type either bare or schema-qualified depending on the
 * version, so both spellings resolve to the same thing.
 */
function sqlTypeOf(name: string): string | undefined {
  return SQL_TYPES[name] ?? SQL_TYPES[name.replace(/^pg_catalog\./, "")];
}

const TABLES: PgTable[] = [schema.users, schema.sessions, schema.trips, schema.flights];

function enumSql(): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const table of TABLES) {
    for (const column of getTableConfig(table).columns) {
      const type = column.getSQLType();
      if (!column.enumValues?.length || seen.has(type)) continue;
      seen.add(type);
      out.push(`CREATE TYPE "${type}" AS ENUM (${column.enumValues.map((v) => `'${v}'`).join(", ")});`);
    }
  }
  return out.join("\n");
}

function tableSql(table: PgTable): string {
  const config = getTableConfig(table);
  const parts: string[] = [];

  for (const column of config.columns) {
    if (column.enumValues?.length) {
      // An enum column's type is its own name; the type is created first.
      parts.push(`  "${column.name}" ${column.getSQLType()}`);
      continue;
    }
    const type = sqlTypeOf(column.getSQLType());
    if (!type) throw new Error(`No SQL type known for ${config.name}.${column.name}: ${column.getSQLType()}`);
    parts.push(
      `  "${column.name}" ${type}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}`,
    );
  }

  for (const fk of config.foreignKeys) {
    // `reference()` is the descriptor Drizzle keeps for the relationship: which
    // columns here point at which columns there.
    const reference = fk.reference() as unknown as {
      columns: { name: string }[];
      foreignTable: PgTable;
      foreignColumns: { name: string }[];
    };
    const from = reference.columns.map((c) => `"${c.name}"`).join(", ");
    const refName = getTableConfig(reference.foreignTable).name;
    const to = reference.foreignColumns.map((c) => `"${c.name}"`).join(", ");
    parts.push(`  FOREIGN KEY (${from}) REFERENCES "${refName}" (${to}) ON DELETE ${fk.onDelete}`);
  }

  return `CREATE TABLE IF NOT EXISTS "${config.name}" (\n${parts.join(",\n")}\n);`;
}

function indexSql(): string {
  const out: string[] = [];
  for (const table of TABLES) {
    const config = getTableConfig(table);
    for (const index of config.indexes) {
      const name = index.config.name;
      if (!name) continue;

      // An index over a SQL expression rather than a column has no column name
      // to quote. The one such index in this schema is written out below.
      const columns = index.config.columns
        .map((c) => (typeof c === "string" ? c : c.name))
        .filter((c): c is string => typeof c === "string")
        .map((c) => `"${c}"`)
        .join(", ");
      if (columns === "") continue;

      out.push(`CREATE INDEX IF NOT EXISTS "${name}" ON "${config.name}" (${columns});`);
    }
  }

  // Uniqueness of an email address regardless of case, which is what stops
  // "Ada@example.com" and "ada@example.com" becoming two accounts. It has to be
  // a function of the column rather than a plain unique constraint.
  out.push(`CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_key" ON "users" (lower("email"));`);
  return out.join("\n");
}

/* -------------------------------------------------------------------- setup */

const client = new PGlite();
const db = drizzle(client, { schema });
setDbOverride(db);

/** Build the whole schema. Re-runnable, so a check can drop it and restore it. */
async function createSchema(): Promise<void> {
  try {
    await client.exec(enumSql());
  } catch {
    // The enum type outlives a table drop, so on a rebuild it is already there.
  }
  for (const table of TABLES) await client.exec(tableSql(table));
  await client.exec(indexSql());
}

await createSchema();

/** A caller that remembers its session cookie, like a browser would. */
function makeClient() {
  let cookie: string | null = null;
  return {
    /** The attributes of the last session cookie set, for assertions. */
    lastCookie: [] as string[],
    async call(method: string, path: string, body?: unknown) {
      const headers: Record<string, string> = {};
      if (body !== undefined) headers["content-type"] = "application/json";
      if (cookie) headers.cookie = cookie;

      const response = await handleRequest(
        new Request(`https://skytrace.test${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );

      for (const entry of response.headers.getSetCookie?.() ?? []) {
        const pair = entry.split(";")[0]!;
        cookie = pair.endsWith("=") ? null : pair;
        this.lastCookie = entry
          .split(";")
          .slice(1)
          .map((part) => part.trim())
          .filter((part) => part !== "Path=/" && !part.startsWith("Max-Age="));
      }

      const text = await response.text();
      return { status: response.status, body: text === "" ? undefined : (JSON.parse(text) as any) };
    },
  };
}

async function account(email: string) {
  const client = makeClient();
  await client.call("POST", "/api/auth/signup", { email, password: "a-good-password" });
  return client;
}

console.log("accounts");
{
  const client = makeClient();
  const signup = await client.call("POST", "/api/auth/signup", {
    email: "Ada@Example.com",
    password: "correct-horse",
  });
  equal("signs up and normalises the email", signup.body, { email: "ada@example.com" });
  equal("reads its own identity back", (await client.call("GET", "/api/users/me")).body, "ada@example.com");

  equal("signs out", (await client.call("POST", "/api/auth/signout")).status, 204);
  equal("is anonymous afterwards", (await client.call("GET", "/api/users/me")).body, null);

  const wrong = await client.call("POST", "/api/auth/signin", {
    email: "ada@example.com",
    password: "not-the-password",
  });
  equal("rejects a wrong password", wrong.status, 401);
  equal(
    "says so without revealing whether the account exists",
    wrong.body,
    { error: "That email and password do not match an account." },
  );

  const ghost = await client.call("POST", "/api/auth/signin", {
    email: "nobody@example.com",
    password: "not-the-password",
  });
  equal("an unknown email fails the same way", ghost.body, wrong.body);

  equal(
    "signs back in with the right password",
    (await client.call("POST", "/api/auth/signin", { email: "ada@example.com", password: "correct-horse" }))
      .status,
    200,
  );

  const duplicate = await client.call("POST", "/api/auth/signup", {
    email: "ADA@example.com",
    password: "another-password",
  });
  equal("refuses a second account for the same email, whatever its case", duplicate.status, 409);

  equal(
    "refuses a short password",
    (await client.call("POST", "/api/auth/signup", { email: "b@example.com", password: "short" })).status,
    400,
  );
  equal(
    "refuses a malformed email",
    (await client.call("POST", "/api/auth/signup", { email: "nope", password: "long-enough" })).status,
    400,
  );

  const stored = await db.select().from(schema.users);
  check(
    "never stores a password in the clear",
    stored.every((row) => row.passwordHash.startsWith("scrypt$") && !row.passwordHash.includes("correct-horse")),
    stored.map((r) => r.passwordHash.slice(0, 12)),
  );
  const hashes = await db.select().from(schema.sessions);
  check(
    "stores session tokens hashed, not raw",
    hashes.every((row) => /^[A-Za-z0-9_-]{43}$/.test(row.tokenHash)),
  );
}

console.log("flights");
{
  const client = await account("flights@example.com");
  const added = await client.call("POST", "/api/flights/add", {
    fromIata: "lhr",
    toIata: "jfk",
    flightDate: "2025-03-14",
    cabin: "business",
  });
  equal("adds a flight", added.status, 200);
  check("returns its id", typeof added.body.id === "string", added.body);

  const list = (await client.call("GET", "/api/flights")).body;
  equal("lists it back", list.length, 1);
  equal("upper-cases the IATA codes", [list[0].fromIata, list[0].toIata], ["LHR", "JFK"]);
  equal("stores the date as yyyy-mm-dd", list[0].flightDate, "2025-03-14");
  equal("attaches the origin's details for the map", list[0].fromName, "London Heathrow Airport");
  equal("attaches the destination's city", list[0].toCity, "New York");
  equal("keeps the cabin", list[0].cabin, "business");
  check("derives a real distance", list[0].distanceKm > 5000, list[0].distanceKm);
  check("derives a duration", list[0].durationMin > 0, list[0].durationMin);
  check("derives CO2", list[0].co2Kg > 0, list[0].co2Kg);

  equal(
    "rejects an unknown origin",
    (await client.call("POST", "/api/flights/add", { fromIata: "ZZZ", toIata: "JFK", flightDate: "2025-01-01" })).body,
    { error: "Unknown origin airport: ZZZ" },
  );
  equal(
    "rejects a date that is not yyyy-mm-dd",
    (await client.call("POST", "/api/flights/add", { fromIata: "LHR", toIata: "JFK", flightDate: "14/03/2025" })).body,
    { error: "Date must be yyyy-mm-dd" },
  );
  equal(
    "rejects a well-shaped date that does not exist",
    (await client.call("POST", "/api/flights/add", { fromIata: "LHR", toIata: "JFK", flightDate: "2025-02-31" })).body,
    { error: "Date must be yyyy-mm-dd" },
  );
  equal(
    "rejects the same airport twice",
    (await client.call("POST", "/api/flights/add", { fromIata: "LHR", toIata: "LHR", flightDate: "2025-01-01" })).body,
    { error: "Origin and destination are the same airport" },
  );
  equal(
    "rejects a rating outside 1-5",
    (await client.call("POST", "/api/flights/add", { fromIata: "LHR", toIata: "JFK", flightDate: "2025-01-01", rating: 9 })).body,
    { error: "Rating must be between 1 and 5" },
  );
}

console.log("duplicates");
{
  const client = await account("duplicates@example.com");
  const flight = { fromIata: "LHR", toIata: "JFK", flightDate: "2025-03-14", flightNumber: "BA178" };
  equal("logs the first one", (await client.call("POST", "/api/flights/add", flight)).status, 200);

  const clash = await client.call("POST", "/api/flights/add", flight);
  equal("warns about the second", clash.status, 400);
  check("with the signal the UI keys off", String(clash.body.error).startsWith("ALREADY_LOGGED:"), clash.body);
  check("naming the flight that clashes", String(clash.body.error).length > "ALREADY_LOGGED:".length);

  equal("logs it anyway when asked", (await client.call("POST", "/api/flights/add", { ...flight, allowDuplicate: true })).status, 200);
  equal("and now there are two", (await client.call("GET", "/api/flights")).body.length, 2);

  const differentNumber = await client.call("POST", "/api/flights/add", { ...flight, flightNumber: "BA179" });
  equal("a different flight number is not a duplicate", differentNumber.status, 200);
}

console.log("editing");
{
  const client = await account("editing@example.com");
  const { body: added } = await client.call("POST", "/api/flights/add", {
    fromIata: "SFO",
    toIata: "NRT",
    flightDate: "2024-11-02",
  });
  const before = (await client.call("GET", "/api/flights")).body[0];

  equal("updates notes and rating", (await client.call("POST", "/api/flights/update", { id: added.id, notes: "window seat", rating: 5 })).status, 204);
  let flight = (await client.call("GET", "/api/flights")).body[0];
  equal("saves the notes", flight.notes, "window seat");
  equal("saves the rating", flight.rating, 5);

  await client.call("POST", "/api/flights/update", { id: added.id, rating: null });
  flight = (await client.call("GET", "/api/flights")).body[0];
  equal("clears the rating when told null", flight.rating, null);
  equal("and leaves fields it was not told about alone", flight.notes, "window seat");

  await client.call("POST", "/api/flights/update", { id: added.id, cabin: "first" });
  const after = (await client.call("GET", "/api/flights")).body[0];
  equal("applies the cabin", after.cabin, "first");
  check(
    "and recomputes CO2 to match it",
    after.co2Kg > before.co2Kg,
    { before: before.co2Kg, after: after.co2Kg },
  );
}

console.log("ownership");
{
  const mine = await account("owner@example.com");
  const theirs = await account("stranger@example.com");
  const { body: added } = await mine.call("POST", "/api/flights/add", {
    fromIata: "LHR",
    toIata: "JFK",
    flightDate: "2025-02-02",
  });

  equal("another user sees an empty log", (await theirs.call("GET", "/api/flights")).body, []);
  equal(
    "and zeroes for their stats, not someone else's",
    (await theirs.call("GET", "/api/flights/stats")).body.flightCount,
    0,
  );
  equal("and cannot delete it", (await theirs.call("POST", "/api/flights/remove", { id: added.id })).status, 404);
  equal("or edit it", (await theirs.call("POST", "/api/flights/update", { id: added.id, notes: "mine now" })).status, 404);
  equal("and it survived the attempt", (await mine.call("GET", "/api/flights")).body.length, 1);
}

console.log("bulk import");
{
  const client = await account("import@example.com");
  const { body } = await client.call("POST", "/api/flights/importBulk", {
    rows: [
      { text: "", date: "2025-01-01" },
      { text: "", fromIata: "LHR", toIata: "JFK", date: "2025-01-01", costMinor: 12345, cabin: "economy" },
      { text: "SFO to NRT", date: "2025-02-02" },
      { text: "SFO to NRT", date: "2025-02-02" },
      { text: "BA 117 LHR JFK" },
      { text: "LHR to JFK", date: "not-a-date" },
      { text: "LHR to JFK", fromIata: "LHR", toIata: "ZZZ", date: "2025-03-03" },
      { text: "something about trains", date: "2025-04-04" },
    ],
  });

  equal(
    "reports each line's fate",
    body.map((r: { status: string }) => r.status),
    // A line with no date and a line with an unknown airport are both reported
    // as `invalid`: the import either used the line or it did not, and these
    // two were not used. Only a line the resolver recognised but could not
    // place is `unresolved`.
    ["invalid", "added", "added", "duplicate", "invalid", "invalid", "invalid", "unresolved"],
  );
  equal("blames the empty line", body[0].message, "Empty line.");
  check("gives every added line a flight id", body[1].flightId && body[2].flightId);
  equal("explains a duplicate", body[3].message, "Already in your log — skipped.");
  check("asks for a date it could not find", body[4].message.startsWith("No date."), body[4].message);
  equal("explains a malformed date", body[5].message, 'Date must be yyyy-mm-dd, got "not-a-date".');
  equal("explains an unknown airport", body[6].message, "Unknown destination airport: ZZZ.");
  check("refuses to guess an unrecognisable line", body[7].message.length > 0, body[7].message);
  equal("numbers lines from one, so the preview can point at the right one", body[6].line, 7);

  const list = (await client.call("GET", "/api/flights")).body;
  equal("and only the good lines were saved", list.length, 2);
  const priced = list.find((f: { costMinor: number | null }) => f.costMinor !== null);
  equal("keeping what the row said", [priced.costMinor, priced.cabin, priced.source], [12345, "economy", "imported"]);

  const tooMany = await client.call("POST", "/api/flights/importBulk", {
    rows: Array.from({ length: 1001 }, () => ({ text: "LHR to JFK", date: "2025-01-01" })),
  });
  equal("refuses more than a thousand rows at once", tooMany.status, 400);
}

console.log("stats");
{
  const client = await account("stats@example.com");
  const add = (args: Record<string, unknown>) => client.call("POST", "/api/flights/add", args);

  await add({ fromIata: "JFK", toIata: "LHR", flightDate: "2024-01-10", costMinor: 50000, currency: "GBP" });
  await add({ fromIata: "LHR", toIata: "JFK", flightDate: "2024-06-10", costMinor: 60000, currency: "GBP" });
  await add({ fromIata: "JFK", toIata: "LHR", flightDate: "2025-01-10", costMinor: 55000, currency: "GBP" });
  await add({ fromIata: "SFO", toIata: "NRT", flightDate: "2023-05-05" });
  await add({ fromIata: "LHR", toIata: "NRT", flightDate: "2025-03-03", rating: 4 });

  const { body: stats } = await client.call("GET", "/api/flights/stats");
  equal("counts the flights", stats.flightCount, 5);
  equal("counts the airports", stats.airportCount, 4);
  check("totals the distance", stats.totalDistanceKm > 20000, stats.totalDistanceKm);
  check("totals the duration", stats.totalDurationMin > 0);
  check("totals the CO2", stats.totalCo2Kg > 0);
  check("finds the longest", stats.longestFlight !== null);
  check("finds the shortest", stats.shortestFlight !== null);
  equal("counts a return leg as the same route", stats.repeatedRoutes[0].count, 3);
  equal("from the first time", stats.repeatedRoutes[0].firstDate, "2024-01-10");
  equal("to the last", stats.repeatedRoutes[0].lastDate, "2025-01-10");
  equal("sums the spend in minor units", stats.totalSpendMinor, 165000);
  equal("names the currency it was mostly recorded in", stats.spendCurrency, "GBP");
  equal("counts the priced flights", stats.pricedFlightCount, 3);
  equal("splits the spend by year", stats.spendByYear.map((y: { year: string }) => y.year), ["2024", "2025"]);
  equal("counts flights by year too", stats.flightsByYear.map((y: { year: string }) => y.year), ["2023", "2024", "2025"]);
  check("finds a most-visited country", stats.mostVisitedCountry !== null);
}

console.log("trips");
{
  const client = await account("trips@example.com");
  const { body: trip } = await client.call("POST", "/api/trips/create", { name: "Japan 2025", startDate: "2025-03-01" });
  check("creates a trip and returns its id", typeof trip === "string", trip);

  await client.call("POST", "/api/flights/add", { fromIata: "LHR", toIata: "HND", flightDate: "2025-03-10", tripId: trip });
  await client.call("POST", "/api/flights/add", { fromIata: "NRT", toIata: "LHR", flightDate: "2025-03-20", tripId: trip });

  const trips = (await client.call("GET", "/api/trips")).body;
  equal("lists it", trips.length, 1);
  equal("with the legs it holds", [trips[0].name, trips[0].flightCount, trips[0].endDate], ["Japan 2025", 2, null]);

  equal("deletes it", (await client.call("POST", "/api/trips/remove", { id: trip })).status, 204);
  equal("and it is gone", (await client.call("GET", "/api/trips")).body, []);

  const flights = (await client.call("GET", "/api/flights")).body;
  equal("but the flights it grouped survive", flights.length, 2);
  check("just detached from it", flights.every((f: { tripId: string | null }) => f.tripId === null));

  equal(
    "rejects an empty name",
    (await client.call("POST", "/api/trips/create", { name: "   ", startDate: "2025-01-01" })).body,
    { error: "Trip name is required" },
  );
  equal(
    "rejects a date that does not exist",
    (await client.call("POST", "/api/trips/create", { name: "Trip", startDate: "2025-13-01" })).body,
    { error: "Invalid start date" },
  );
  equal(
    "rejects attaching a flight to a trip that is not yours",
    (await client.call("POST", "/api/flights/add", { fromIata: "LHR", toIata: "JFK", flightDate: "2025-06-06", tripId: "00000000-0000-0000-0000-000000000000" })).body,
    { error: "Unknown trip" },
  );
}

console.log("signed out");
{
  const client = makeClient();
  equal("an empty log, not an error", (await client.call("GET", "/api/flights")).body, []);
  equal("no trips", (await client.call("GET", "/api/trips")).body, []);
  equal("no identity", (await client.call("GET", "/api/users/me")).body, null);
  equal("cannot add a flight", (await client.call("POST", "/api/flights/add", { fromIata: "LHR", toIata: "JFK", flightDate: "2025-01-01" })).status, 401);
  equal("cannot create a trip", (await client.call("POST", "/api/trips/create", { name: "Nope", startDate: "2025-01-01" })).status, 401);
}

console.log("public endpoints");
{
  const client = makeClient();
  const resolved = await client.call("GET", "/api/resolve?query=UA%201234%20in%20March%202025");
  equal("the resolver works signed out", resolved.status, 200);
  check("and returns candidates", resolved.body.candidates.length > 0, resolved.body.candidates.length);

  const airports = await client.call("GET", "/api/airports/search?query=heathrow&limit=2");
  equal("airport search works signed out", airports.body[0].iata, "LHR");
  equal("airport lookup confirms one code", (await client.call("GET", "/api/airports/lookup?iata=SFO")).body.city, "San Francisco");
  equal("and returns null for a code it does not have", (await client.call("GET", "/api/airports/lookup?iata=ZZZ")).body, null);
  check(
    "airport search is capped",
    (await client.call("GET", "/api/airports/search?query=a&limit=99")).body.length <= 12,
  );
}

console.log("routing");
{
  const health = await handleRequest(new Request("https://x/api/health"));
  equal("health is reachable and reports the database is ready", [health.status, (await health.clone().json()).database], [200, "ready"]);

  equal("health is GET only", (await handleRequest(new Request("https://x/api/health", { method: "POST" }))).status, 405);
  equal("an unknown path is 404", (await handleRequest(new Request("https://x/api/nope"))).status, 404);
  equal("a wrong method is 405", (await handleRequest(new Request("https://x/api/flights/stats", { method: "POST" }))).status, 405);
  equal("a non-API path is 404", (await handleRequest(new Request("https://x/dashboard"))).status, 404);

  const bad = await handleRequest(
    new Request("https://x/api/auth/signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    }),
  );
  equal("a malformed body is a 400, not a crash", bad.status, 400);
  equal("and says so", (await bad.json()).error, "Malformed JSON");
}

console.log("node adapter");
{
  // The production entry points — `api/[...path].ts` on Vercel and
  // `server/start.ts` anywhere else — both reach the routes through this
  // adapter, and neither is exercised by the browser check. So it is exercised
  // here, against the shapes Node and the platform actually hand over.
  const { toWebRequest, sendWebResponse } = await import("../server/node-adapter.ts");

  const nodeRequest = (over: Record<string, unknown> = {}) =>
    ({
      method: "GET",
      url: "/api/flights",
      headers: { host: "skytrace.test" },
      ...over,
    }) as never;

  /** Stands in for the unread stream a plain Node request arrives as. */
  const streamOf = (text: string) => {
    const listeners: Record<string, ((arg: unknown) => void)[]> = {};
    return {
      on(event: string, fn: (arg: unknown) => void) {
        (listeners[event] ??= []).push(fn);
        return this;
      },
      emit(event: string, arg: unknown) {
        for (const fn of listeners[event] ?? []) fn(arg);
      },
      feed() {
        this.emit("data", Buffer.from(text, "utf8"));
        this.emit("end", undefined);
      },
    };
  };

  // Stands in for a Node `ServerResponse`, and deliberately provides only what
  // Node actually provides. An earlier version of this mock also had
  // `status()`, which let the adapter call an Express method that does not
  // exist on a real response: the server bound its port and then answered every
  // request with a 500. A faithful stand-in fails loudly instead.
  const capture = () => {
    const headers: Record<string, string | string[]> = {};
    return {
      statusCode: 0,
      body: "",
      ended: false,
      headersSent: false,
      setHeader: (k: string, v: string | string[]) => {
        headers[k.toLowerCase()] = v;
      },
      getHeader: (k: string) => headers[k.toLowerCase()],
      end(chunk?: string) {
        this.body = chunk ?? "";
        this.ended = true;
      },
      headers,
    };
  };

  const from = await toWebRequest(nodeRequest());
  equal("rebuilds the path and host", from.url, "http://skytrace.test/api/flights");
  equal("keeps the method", from.method, "GET");
  equal("carries a GET no body", from.body, null);

  const withQuery = await toWebRequest(nodeRequest({ url: "/api/resolve?query=UA+1234" }));
  equal("keeps the query string", new URL(withQuery.url).searchParams.get("query"), "UA 1234");

  const fromPlatformQuery = await toWebRequest(nodeRequest({ url: "/api/resolve", query: { query: "UA 1234" } }));
  equal(
    "merges a parsed query the platform supplied",
    new URL(fromPlatformQuery.url).searchParams.get("query"),
    "UA 1234",
  );

  const withBody = await toWebRequest(
    nodeRequest({ method: "POST", url: "/api/auth/signin", body: { email: "a@b.com", password: "x" } }),
  );
  equal("re-serialises a body the platform already parsed", await withBody.text(), '{"email":"a@b.com","password":"x"}');

  // Plain Node hands over an unread stream and no `req.body` at all. Reading
  // only the platform's parsed body means every POST arrives empty on a Node
  // host: sign-in and saving fail while the platform build works fine.
  const streamed = streamOf('{"email":"c@d.com","password":"y"}');
  const pending = toWebRequest(
    nodeRequest({ method: "POST", url: "/api/auth/signin", body: undefined, on: streamed.on.bind(streamed) }),
  );
  // Fed before awaiting: `readStream` attaches its listeners synchronously, so
  // by the time `toWebRequest` returns a promise the stream is ready to deliver.
  streamed.feed();
  const fromStream = await pending;
  equal("reads a body off the Node stream when none was parsed", await fromStream.text(), '{"email":"c@d.com","password":"y"}');

  const emptyPost = await toWebRequest(nodeRequest({ method: "POST", url: "/api/auth/signin" }));
  equal("an empty POST becomes no body rather than an empty one", emptyPost.body, null);

  const cookie = capture();
  await sendWebResponse(cookie as never, new Response(null, { status: 204 }));
  equal("writes the status", cookie.statusCode, 204);
  equal("ends an empty body", cookie.body, "");
  equal("actually ended the response", cookie.ended, true);
  equal(
    "uses only methods a real Node response has",
    ["status" in cookie, "json" in cookie, "send" in cookie],
    [false, false, false],
  );

  // The one that browsers actually get wrong: two Set-Cookie headers collapsed
  // into one comma-joined string.
  const twoCookies = new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  twoCookies.headers.append("set-cookie", "a=1; Path=/");
  twoCookies.headers.append("set-cookie", "b=2; Path=/");
  const multi = capture();
  await sendWebResponse(multi as never, twoCookies);
  equal("keeps Set-Cookie headers separate", multi.headers["set-cookie"], ["a=1; Path=/", "b=2; Path=/"]);
  equal("and does not duplicate them as ordinary headers", multi.headers["content-type"], "application/json");

  // Round trip: the adapter must preserve exactly what the router produced.
  const source = await handleRequest(
    new Request("https://skytrace.test/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `adapter-${Date.now()}@example.com`, password: "a-good-password" }),
    }),
  );
  const relayed = capture();
  await sendWebResponse(relayed as never, source);
  equal("relays a real response verbatim", relayed.statusCode, 200);
  equal("with its session cookie intact", (relayed.headers["set-cookie"] as string[]).length, 1);
  equal("and its body", JSON.parse(relayed.body).email.startsWith("adapter-"), true);
}

console.log("cross-origin");
{
  // The frontend is on Vercel and the API on Render, so every browser request
  // is cross-site. These are the three things that silently break sign-in when
  // they are wrong, and none of them fail loudly: the browser just discards
  // the response, or never sends the cookie, and the app looks merely broken.
  const { resetCorsCache, isCrossOriginMode, isAllowedOrigin, isBlockedByCsrf } = await import(
    "../server/cors.ts"
  );
  const FRONTEND = "https://flight-visualizer-frontend-cyan.vercel.app";
  const API = "https://flight-visualizer.onrender.com";

  const from = (origin: string | null, init: RequestInit = {}) =>
    new Request(`${API}/api/flights`, {
      ...init,
      headers: { ...(origin ? { origin } : {}), ...((init.headers as object) ?? {}) },
    });

  resetCorsCache();
  delete process.env.ALLOWED_ORIGINS;
  equal("with nothing configured, it stays single-origin", isCrossOriginMode(), false);
  check("a request with no Origin is never restricted", isAllowedOrigin(from(null)));
  check("a request with some Origin is refused when none is allowed", !isAllowedOrigin(from("https://evil.example")));

  process.env.ALLOWED_ORIGINS = `${FRONTEND} , https://other.example/`;
  resetCorsCache();
  equal("an allowlist turns on cross-origin mode", isCrossOriginMode(), true);
  check("the configured frontend is allowed", isAllowedOrigin(from(FRONTEND)));
  check("a trailing slash does not break the match", isAllowedOrigin(from(`${FRONTEND}/`)));
  check("a second origin in the list is allowed", isAllowedOrigin(from("https://other.example")));
  check("an unlisted origin is refused", !isAllowedOrigin(from("https://evil.example")));
  check(
    "a look-alike origin is refused",
    !isAllowedOrigin(from("https://flight-visualizer-frontend-cyan.vercel.app.evil.example")),
  );

  process.env.ALLOWED_ORIGINS = "*";
  resetCorsCache();
  equal("a wildcard is refused rather than honoured", isCrossOriginMode(), false);

  // Responses must carry the headers, not just the preflight.
  resetCorsCache();
  process.env.ALLOWED_ORIGINS = FRONTEND;
  resetCorsCache();
  const allowed = await handleRequest(from(FRONTEND));
  check("an allowed origin appears in the response", allowed.headers.get("access-control-allow-origin") === FRONTEND);
  equal("credentials are explicitly allowed", allowed.headers.get("access-control-allow-credentials"), "true");
  check("and the response varies on Origin, so a CDN cannot mix them up", (allowed.headers.get("vary") ?? "").includes("Origin"));
  check(
    "the origin is never sent as a wildcard",
    allowed.headers.get("access-control-allow-origin") !== "*",
  );

  const refused = await handleRequest(from("https://evil.example"));
  check("a refused origin gets no allow header", refused.headers.get("access-control-allow-origin") === null);

  const preflight = await handleRequest(
    from(FRONTEND, { method: "OPTIONS", headers: { "access-control-request-method": "POST" } }),
  );
  equal("the preflight succeeds for an allowed origin", preflight.status, 204);
  check("and advertises the client header", (preflight.headers.get("access-control-allow-headers") ?? "").includes("x-skytrace-client"));
  equal(
    "a preflight from an unlisted origin is refused",
    (await handleRequest(from("https://evil.example", { method: "OPTIONS" }))).status,
    403,
  );

  // CSRF: another site may not write with the user's cookie attached.
  // Posted at a real POST route, so a 405 for the wrong method cannot be
  // mistaken for the 403 this is checking for.
  const crossPost = (headers: Record<string, string>) =>
    new Request(`${API}/api/flights/add`, {
      method: "POST",
      headers: { origin: FRONTEND, ...headers },
      body: "{}",
    });
  check(
    "a cross-origin write without the client header is blocked",
    isBlockedByCsrf(crossPost({})),
  );
  check(
    "a cross-origin write with it is allowed",
    !isBlockedByCsrf(crossPost({ "x-skytrace-client": "1" })),
  );
  check(
    "a same-origin write is not restricted",
    !isBlockedByCsrf(
      new Request(`${API}/api/flights/add`, { method: "POST", body: "{}" }),
    ),
  );
  equal(
    "and the router actually refuses it",
    (await handleRequest(crossPost({}))).status,
    403,
  );

  // The cookie has to be cross-site capable, or sign-in silently forgets you.
  const signedIn = makeClient();
  await signedIn.call("POST", "/api/auth/signup", { email: `cors-${Date.now()}@example.com`, password: "a-good-password" });
  equal(
    "the session cookie is SameSite=None when cross-origin",
    signedIn.lastCookie,
    ["HttpOnly", "SameSite=None", "Secure"],
  );

  process.env.ALLOWED_ORIGINS = "";
  resetCorsCache();
  const single = makeClient();
  await single.call("POST", "/api/auth/signup", { email: `same-${Date.now()}@example.com`, password: "a-good-password" });
  equal(
    "and SameSite=Lax when it is not",
    single.lastCookie,
    // `Secure` as well: the test client speaks HTTPS, and a cookie without it
    // would be rejected by a browser anyway.
    ["HttpOnly", "SameSite=Lax", "Secure"],
  );

  delete process.env.ALLOWED_ORIGINS;
  resetCorsCache();
}

console.log("demo data");
{
  // The seeder runs from `start`, so a deployment with a fresh database is
  // only useful if it actually produces a log worth looking at. These are the
  // properties that matter: it fills something in, what it writes is real
  // rather than typed in, and running it twice changes nothing.
  const { seedDemo } = await import("./seed-demo.ts");
  const email = "demo@seeded.test";

  const first = await seedDemo(db, email, "a-demo-password");
  check("seeds an account that was not there", first.created);
  if (first.created) {
    const rows = await db
      .select()
      .from(schema.flights)
      .where(eq(schema.flights.userId, first.userId));
    equal("with the flights from the seed table", rows.length, first.flightCount);
    check("more than a token sample", rows.length >= 5, rows.length);

    const longest = rows.reduce((a, b) => (a.distanceKm > b.distanceKm ? a : b));
    const sfoJfk = rows.find((r) => r.fromIata === "SFO" && r.toIata === "JFK");
    check("distances are computed, not typed in", sfoJfk !== undefined && sfoJfk.distanceKm > 3_800 && sfoJfk.distanceKm < 4_200, sfoJfk?.distanceKm);
    check("emissions follow the distance", rows.every((r) => r.co2Kg > 0 && Number.isFinite(r.co2Kg)));
    check("durations follow the distance", rows.every((r) => r.durationMin > 0 && Number.isFinite(r.durationMin)));
    check("a long haul beats a short hop", longest.distanceKm > 3_000, longest.distanceKm);
    check("every seeded flight is on the trip", rows.every((r) => r.tripId === first.tripId));
    check("airline names are resolved, not left null", rows.every((r) => r.airlineName !== null));

    const trip = await db.select().from(schema.trips).where(eq(schema.trips.id, first.tripId));
    equal("and the trip they belong to", trip[0]?.name, "Japan 2025");

    // The password must be the one supplied, and only a hash of it stored.
    const stored = await db.select().from(schema.users).where(eq(schema.users.email, email));
    check("stores a hash rather than the password", stored[0]?.passwordHash !== "a-demo-password" && (stored[0]?.passwordHash.length ?? 0) > 40);
    const { verifyPassword } = await import("../server/password.ts");
    check("and it verifies", await verifyPassword("a-demo-password", stored[0]!.passwordHash));
    check("while a wrong password does not", !(await verifyPassword("not-the-password", stored[0]!.passwordHash)));
  }

  const before = await db.select().from(schema.flights);
  const second = await seedDemo(db, email, "a-demo-password");
  check("a second run creates nothing", second.created === false);
  equal("and leaves the log exactly as it was", (await db.select().from(schema.flights)).length, before.length);

  let rejected = false;
  try {
    await seedDemo(db, "short@seeded.test", "tiny");
  } catch {
    rejected = true;
  }
  check("refuses a password the app would refuse", rejected);
  equal("  and writes nothing while refusing", (await db.select().from(schema.users).where(eq(schema.users.email, "short@seeded.test"))).length, 0);
}

console.log("flight lookup");
{
  // The provider is stubbed, because the credentials are the one thing these
  // checks cannot have and the shape of the answer is everything they can.
  // The point being proved is that a real flight number becomes a real
  // candidate — and that nothing at all depends on the key being present.
  const { normaliseQuery, resetLookupCache } = await import("../server/flight-lookup/index.ts");
  const realFetch = globalThis.fetch;

  equal("parses a carrier and a number", normaliseQuery("ua", "1234"), { airline: "UA", flightNumber: "1234" });
  equal("parses them written together", normaliseQuery(null, "UA1234"), { airline: "UA", flightNumber: "1234" });
  check("a number with no carrier is not enough", normaliseQuery(null, "1234") === null);
  check("neither is nonsense", normaliseQuery("not", "a flight") === null);

  const caller = await account("lookup@example.com");
  const anon = makeClient();

  // Nothing configured is the default state of this repository.
  {
    const saved = process.env.AERODATABOX_API_KEY;
    delete process.env.AERODATABOX_API_KEY;
    resetLookupCache();

    const status = await caller.call("GET", "/api/lookup/status");
    equal("the status endpoint reports it is off", status.body, { configured: false, unavailable: null });

    const miss = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("an unconfigured lookup is not an error", miss.status, 200);
    equal("  and says so rather than failing", miss.body, { configured: false, provider: null, flight: null });

    if (saved !== undefined) process.env.AERODATABOX_API_KEY = saved;
    resetLookupCache();
  }

  const badQuery = await caller.call("GET", "/api/lookup/flight?airline=UA");
  equal("a missing flight number is rejected", badQuery.status, 400);
  const badDate = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234&date=14-03-2025");
  equal("a badly written date is rejected", badDate.status, 400);
  const signedOut = await anon.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
  equal("a signed-out caller cannot spend the provider's quota", signedOut.status, 401);
  const signedOutStatus = await anon.call("GET", "/api/lookup/status");
  equal("  nor learn whether one is configured", signedOutStatus.status, 401);

  process.env.AERODATABOX_API_KEY = "test-key";
  resetLookupCache();

  /** Serve one canned provider response, and count what it was asked. */
  const stub = (responses: Record<string, unknown>) => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      for (const [fragment, body] of Object.entries(responses)) {
        if (url.includes(fragment)) {
          return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        }
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    return calls;
  };

  /**
   * A provider record, in the shape the API actually returns.
   *
   * The ICAO codes are real rather than the IATA repeated, because a check
   * that falls back to ICAO has to be given an ICAO the dataset would
   * recognise — repeating the IATA would make the fallback pass for the wrong
   * reason, or fail for an unrelated one.
   */
  const ICAO: Record<string, string> = { SFO: "KSFO", JFK: "KJFK", LHR: "EGLL" };
  const flightRow = (from: string, to: string) => ({
    number: "UA1234",
    status: "Expected",
    isCargo: false,
    codeshareStatus: "IsOperator",
    lastUpdatedUtc: "2025-03-14T00:00:00Z",
    airline: { iata: "UA", icao: "UAL", name: "United Airlines" },
    aircraft: { reg: "N12345", modeS: "ABC123", model: "Boeing 737-800" },
    departure: {
      airport: { iata: from, icao: ICAO[from] ?? null, fullName: from },
      scheduledTime: { local: "2025-03-14T10:35:00", utc: "2025-03-14T18:35:00Z" },
      terminal: "3",
      gate: "G12",
      quality: ["Live"],
    },
    arrival: {
      airport: { iata: to, icao: ICAO[to] ?? null, fullName: to },
      scheduledTime: { local: "2025-03-14T18:52:00", utc: "2025-03-15T02:52:00Z" },
      terminal: "B",
      quality: ["Live"],
    },
  });

  {
    const calls = stub({ "aerodatabox.com": [flightRow("SFO", "JFK")] });
    const found = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234&date=2025-03-14");
    check("a real flight comes back", found.status === 200, found);
    equal("  with the route the provider gave", found.body?.flight?.departure?.iata, "SFO");
    equal("  and the other end of it", found.body?.flight?.arrival?.iata, "JFK");
    equal("  the equipment it was worked", found.body?.flight?.aircraft, "Boeing 737-800");
    equal("  the terminal", found.body?.flight?.departure?.terminal, "3");
    equal("  the gate", found.body?.flight?.departure?.gate, "G12");
    check("  the times are the airport's local time, not a coerced UTC", found.body?.flight?.departure?.scheduledAt === "2025-03-14T10:35", found.body?.flight?.departure?.scheduledAt);
    equal("  the provider names itself rather than the one it replaced", found.body?.provider, "aerodatabox");
    check("the request carried the carrier, number and date", calls.some((u) => u.includes("/flights/Number/UA1234/2025-03-14")), calls);
    check("and the key travelled in the header, never the URL", !calls.some((u) => u.includes("test-key")));

    const captured: RequestInit[] = [];
    const realFetchHeaders = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      captured.push(init ?? {});
      return realFetchHeaders(input, init);
    }) as typeof fetch;
    resetLookupCache();
    await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234&date=2025-03-14");
    const headers = (captured.at(-1)?.headers ?? {}) as Record<string, string>;
    equal("  the key is sent as the header the provider documents", headers["X-Api-Key"], "test-key");
    globalThis.fetch = realFetchHeaders;
  }

  {
    // The free plan meters every call, so a repeated question must not spend
    // the budget twice. This is the property the retired provider got from
    // caching a token; here it is the answer itself that is memoised, which is
    // the stronger saving because the second lookup never reaches the network.
    resetLookupCache();
    const calls = stub({ "aerodatabox.com": [flightRow("SFO", "JFK")] });
    await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("the same question twice costs one provider call", calls.length, 1);

    await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1235");
    equal("  a different flight is not answered from the first one's cache", calls.length, 2);
  }

  {
    // Caching an answer is not enough on its own: three lookups arriving
    // together on a cold cache would each miss it and each spend a call, and
    // the free plan rate-limits to one request a second anyway. They have to
    // share the one request that is already in flight.
    resetLookupCache();
    let requests = 0;
    const realSetTimeout = setTimeout;
    globalThis.fetch = (async () => {
      requests += 1;
      // Hold it open, so every lookup below is demonstrably concurrent.
      await new Promise((resolve) => realSetTimeout(resolve, 50));
      return new Response(JSON.stringify([flightRow("SFO", "JFK")]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const answered = await Promise.all([
      caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234"),
      caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234"),
      caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234"),
    ]);
    equal("concurrent identical lookups share one request", requests, 1);
    check("  and every one of them is still answered", answered.every((r) => r.status === 200), answered);
  }

  {
    // An unrecognised status falls back to whether the flight has arrived. The
    // comparison is wall-clock to wall-clock, so a flight near midnight is
    // classified the same wherever the host happens to run.
    const unrecognised = (arrival: string) => ({
      ...flightRow("SFO", "JFK"),
      status: "Teleported",
      arrival: {
        airport: { iata: "JFK", icao: "KJFK", fullName: "JFK" },
        scheduledTime: { local: arrival, utc: arrival + "Z" },
        terminal: "B",
        quality: ["Live"],
      },
    });

    resetLookupCache();
    stub({ "aerodatabox.com": [unrecognised("2020-01-02T03:04:00")] });
    const past = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("an unrecognised status in the past reads as landed", past.body?.flight?.status, "landed");

    resetLookupCache();
    stub({ "aerodatabox.com": [unrecognised("2099-01-02T03:04:00")] });
    const future = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("  and one in the future as unknown", future.body?.flight?.status, "unknown");
  }

  {
    // The provider's own states are folded rather than renamed: a flight log
    // records what happened, and "boarding" and "gate closed" are both a
    // flight that has not left yet.
    const withStatus = (status: string) => ({ ...flightRow("SFO", "JFK"), status });
    const readStatus = async (status: string) => {
      resetLookupCache();
      stub({ "aerodatabox.com": [withStatus(status)] });
      const r = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
      return r.body?.flight?.status;
    };

    equal("a flight still at the gate is scheduled", await readStatus("Boarding"), "scheduled");
    equal("one in the air is active", await readStatus("EnRoute"), "active");
    equal("one that has arrived has landed", await readStatus("Arrived"), "landed");
    equal("a cancelled one is cancelled", await readStatus("Canceled"), "cancelled");
    equal("  including the uncertain kind", await readStatus("CanceledUncertain"), "cancelled");
    equal("a diverted one says so", await readStatus("Diverted"), "diverted");
  }

  {
    // A revised time is the actual once the flight has moved and an estimate
    // before that, so it is carried through and labelled as the provider's.
    resetLookupCache();
    stub({
      "aerodatabox.com": [
        {
          ...flightRow("SFO", "JFK"),
          status: "Arrived",
          departure: {
            ...flightRow("SFO", "JFK").departure,
            revisedTime: { local: "2025-03-14T10:52:00", utc: "2025-03-14T18:52:00Z" },
          },
        },
      ],
    });
    const revised = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("a revised time is kept as the actual", revised.body?.flight?.departure?.actualAt, "2025-03-14T10:52");
    equal("  and the schedule is still the schedule", revised.body?.flight?.departure?.scheduledAt, "2025-03-14T10:35");
  }

  {
    // 204 is how the provider says "no such flight", and it carries no body at
    // all. An empty array on a 200 is the same answer said the other way, and
    // both are a miss rather than an outage — the difference decides whether
    // the client offers to search by date instead.
    resetLookupCache();
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    const empty = await caller.call("GET", "/api/lookup/flight?airline=QQ&flightNumber=9999&date=2025-03-14");
    equal("an empty 204 is a 404", empty.status, 404);
    check("  and the message suggests what to change", String(empty.body?.error).includes("without the date"), empty.body);

    resetLookupCache();
    stub({ "aerodatabox.com": [] });
    const none = await caller.call("GET", "/api/lookup/flight?airline=QQ&flightNumber=9999&date=2025-03-14");
    equal("an empty result is a 404 too", none.status, 404);
  }

  {
    // The ICAO fallback is only as good as the index behind it. Every airport
    // has to carry a code, and the codes have to be distinct — a collision
    // would make the fallback pick one of two real airports at random, which
    // is the confident wrong answer this app refuses to give elsewhere. The
    // provider's comments assert both facts, so they are checked here rather
    // than trusted.
    const { airports } = await import("@skytrace/data");
    equal("every airport in the dataset has an ICAO code", airports.filter((a) => a.icao).length, airports.length);
    equal("  and no two airports share one", new Set(airports.map((a) => a.icao)).size, airports.length);
  }

  {
    // The provider documents both airport codes as nullable and sends them as
    // a pair, so a flight known only by its ICAO code is a real flight to a
    // field with no IATA of its own. Refusing it would lose a lookup the
    // dataset can place, since every row carries both codes.
    resetLookupCache();
    const icaoOnly = (row: Record<string, unknown>, side: "departure" | "arrival") => {
      const next = structuredClone(row) as Record<string, Record<string, unknown>>;
      const airport = next[side]!.airport as Record<string, unknown>;
      // What a real response looks like when the field has no IATA code.
      airport.iata = null;
      return next;
    };

    stub({ "aerodatabox.com": [icaoOnly(flightRow("SFO", "JFK") as never, "arrival")] });
    const byArrivalIcao = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    check("an arrival known only by ICAO is still placed", byArrivalIcao.status === 200, byArrivalIcao);
    equal("  and resolves to the airport's IATA code", byArrivalIcao.body?.flight?.arrival?.iata, "JFK");

    resetLookupCache();
    stub({ "aerodatabox.com": [icaoOnly(flightRow("SFO", "JFK") as never, "departure")] });
    const byDepartureIcao = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    check("and a departure known only by ICAO", byDepartureIcao.status === 200, byDepartureIcao);
    equal("  resolves to the right code too", byDepartureIcao.body?.flight?.departure?.iata, "SFO");
  }

  {
    // Neither code being one this app has coordinates for is different: there
    // is nothing that could be drawn, so it is refused rather than guessed at.
    resetLookupCache();
    const unknownCodes = structuredClone(flightRow("SFO", "JFK") as never) as Record<
      string,
      Record<string, unknown>
    >;
    (unknownCodes.arrival!.airport as Record<string, unknown>).iata = "QQQ";
    (unknownCodes.arrival!.airport as Record<string, unknown>).icao = "XXXX";
    stub({ "aerodatabox.com": [unknownCodes] });
    const unplaceable = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("an airport under neither code is still refused", unplaceable.status, 422);
  }

  {
    // A partial record must not hide a complete one beside it: the provider
    // returns a list, and the list is the answer.
    resetLookupCache();
    const partial = structuredClone(flightRow("SFO", "JFK") as never) as Record<
      string,
      Record<string, unknown>
    >;
    delete partial.arrival;
    stub({ "aerodatabox.com": [partial, flightRow("LHR", "SFO")] });
    const beside = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    check("a complete record beside a partial one is still found", beside.status === 200, beside);
    equal("  and it is the one that could be used", beside.body?.flight?.departure?.iata, "LHR");
  }

  {
    // A 401 is a key the provider will not accept, which is the operator's
    // problem to fix — not a bad flight number, and not an outage. Reporting it
    // as a 422 would point at the wrong thing entirely.
    resetLookupCache();
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "nope" }), { status: 401 })) as typeof fetch;
    const badKey = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("a rejected key is refused rather than reported as a miss", badKey.status, 422);

    // 402 and 429 are billing answers. The free plan returns 402 with "your
    // plan is expired and/or included monthly API units and credits have been
    // exhausted" once its few hundred calls a month are gone, and folding that
    // into provider-unavailable reported it as "the provider did not answer" —
    // sending the reader to check a network that was working perfectly.
    resetLookupCache();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "Your plan is expired and/or included monthly API units and credits have been exhausted." }), {
        status: 402,
      })) as typeof fetch;
    const spent = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("an exhausted plan is a 503, not an upstream 502", spent.status, 503);
    check("  and says the plan is the problem", /plan|units/i.test(String(spent.body?.error)), spent.body);
    check("  and does not blame the network", !/did not answer/i.test(String(spent.body?.error)), spent.body);
    check("  and says what to do about it", /top up|renew/i.test(String(spent.body?.error)), spent.body);

    // The same failure has to be explainable before anything is clicked, or the
    // user meets it only by pressing a button that cannot work.
    const statusAfterSpend = await caller.call("GET", "/api/lookup/status");
    equal("a refused key is still configured", statusAfterSpend.body?.configured, true);
    check(
      "  and the status endpoint explains why before any lookup",
      /plan|units/i.test(String(statusAfterSpend.body?.unavailable)),
      statusAfterSpend.body,
    );

    // A top-up does not restart the process, so a remembered refusal must not
    // outlive the problem it remembers.
    resetLookupCache();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "slow down" }), { status: 429 })) as typeof fetch;
    const limited = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("a rate limit is a 429 the client may retry", limited.status, 429);
    check("  and is named as a rate limit", /rate limit|throttl/i.test(String(limited.body?.error)), limited.body);
    check("  and does not claim the plan is gone", !/plan is expired/i.test(String(limited.body?.error)), limited.body);

    // One real answer clears the standing objection, so a topped-up plan is
    // noticed by the next successful lookup rather than only by the clock.
    resetLookupCache();
    stub({ "aerodatabox.com": [flightRow("SFO", "JFK")] });
    const recovered = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    check("a working provider is reachable again once it answers", recovered.status === 200, recovered);
    const statusAfterRecovery = await caller.call("GET", "/api/lookup/status");
    equal("  and the status endpoint stops warning", statusAfterRecovery.body?.unavailable, null);
  }

  {
    // A provider that names an airport this app has never heard of cannot be
    // drawn on the map, so it is refused rather than offered as a candidate.
    resetLookupCache();
    stub({ "aerodatabox.com": [flightRow("SFO", "ZZZ")] });
    const unmappable = await caller.call("GET", "/api/lookup/flight?airline=QQ&flightNumber=1&date=2025-03-14");
    equal("a flight this app cannot place is a 422", unmappable.status, 422);
  }

  {
    // An upstream failure is not remembered: caching one would answer the next
    // lookup from the outage for the length of the TTL.
    resetLookupCache();
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("ENOTFOUND api.aerodatabox.com");
      return new Response(JSON.stringify([flightRow("SFO", "JFK")]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const down = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("a provider that is down is a 502, not a 500", down.status, 502);
    const retried = await caller.call("GET", "/api/lookup/flight?airline=UA&flightNumber=1234");
    equal("  and the outage is not cached against the flight", retried.status, 200);
  }

  globalThis.fetch = realFetch;
  delete process.env.AERODATABOX_API_KEY;
  resetLookupCache();
}

console.log("boot wiring");
{
  // Two settings that decide whether a deployment applies its own schema, and
  // both have failed on a real host while every functional test still passed.
  // They are checked here by reading the files, because neither is observable
  // from the API: a `start` that quietly skips the push, or a push that stops
  // to ask a question nobody is there to answer, looks identical to "still
  // deploying" from outside.
  const { readFileSync } = await import("node:fs");

  const root = new URL("../..", import.meta.url);
  const start = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const backendPkg = JSON.parse(readFileSync(new URL("backend/package.json", root), "utf8"));

  check("the root start script delegates to the backend", start.scripts.start.includes("backend"));
  check("the backend start applies the schema", backendPkg.scripts.start.includes("db:push"));
  check("and seeds before serving", backendPkg.scripts.start.indexOf("seed-demo") > 0);
  check("neither step can stop the server booting", backendPkg.scripts.start.includes("; node server/start.ts"));

  // `strict: true` means "always ask". A host has no terminal to ask on.
  const config = readFileSync(new URL("backend/drizzle.config.ts", root), "utf8");
  check("drizzle does not stop to ask for confirmation", !/strict:\s*true/.test(config));
  check("and never passes --force, which would truncate a flight log", !/push[^\n]*--force/.test(backendPkg.scripts["db:push"] ?? ""));
}

console.log("database failures");
{
  // The point of this section: a database that is configured but unusable is
  // the hardest failure to diagnose, and it used to be a bare 500. Each of
  // these is what a real deployment looks like when something is missing.
  const { diagnoseDatabaseError } = await import("../server/db-errors.ts");

  const cases: [string, unknown, string][] = [
    ["tables never created", { code: "42P01", message: 'relation "users" does not exist' }, "db:push"],
    ["schema out of date", { code: "42703", message: 'column "foo" does not exist' }, "db:push"],
    ["database does not exist", { code: "3D000", message: 'database "skytrace" does not exist' }, "connection string"],
    ["wrong password", { code: "28P01", message: "password authentication failed for user \"x\"" }, "password"],
    ["host does not resolve", { message: "getaddrinfo ENOTFOUND db.example.com" }, "DATABASE_URL"],
  ];

  for (const [name, error, expect] of cases) {
    const diagnosis = diagnoseDatabaseError(error);
    check(`recognises: ${name}`, diagnosis !== null);
    check(
      `  and says what to do: ${name}`,
      (diagnosis?.remedy ?? "").includes(expect),
      diagnosis?.remedy,
    );
  }

  check("a state inside the message is still found", diagnoseDatabaseError({ message: '[42P01] relation "x" does not exist' }) !== null);
  check("a numeric code is still found", diagnoseDatabaseError({ code: 42, message: "relation \"x\" does not exist" }) !== null);
  check("an unrelated error is not guessed at", diagnoseDatabaseError(new Error("kaboom")) === null);
  check("a non-error is not guessed at", diagnoseDatabaseError(null) === null);

  // The shapes that actually arrive. Drizzle wraps every failed query, and the
  // wrapper's own message is only the SQL, so the state is always on `.cause`
  // and never at the top level. The cases above all put the code at the top
  // level, which is why they passed while every real failure was a bare 500.
  const wrapped: [string, unknown, string][] = [
    [
      "drizzle wrapping a missing table",
      { message: 'Failed query: select "id" from "users"', cause: { code: "42P01", message: 'relation "users" does not exist' } },
      "db:push",
    ],
    [
      "pg's originalError wrapper",
      { message: "write failed", originalError: { code: "28P01", message: "password authentication failed" } },
      "password",
    ],
    [
      "a wrapper around a wrapper",
      { message: "Failed query: select 1", cause: { message: "wrapped", cause: { code: "42P01", message: 'relation "flights" does not exist' } } },
      "db:push",
    ],
    [
      "a wrapper with no code anywhere, only the reason",
      { message: "Failed query: select 1", cause: { message: 'relation "trips" does not exist' } },
      "db:push",
    ],
  ];

  for (const [name, error, expect] of wrapped) {
    const diagnosis = diagnoseDatabaseError(error);
    check(`looks through a wrapper: ${name}`, diagnosis !== null);
    check(`  and still says what to do: ${name}`, (diagnosis?.remedy ?? "").includes(expect), diagnosis?.remedy);
  }

  // The end-to-end version of the same bug, against a real Postgres with no
  // tables in it — the state a freshly provisioned database is in, which is
  // what a sign-up hits the moment it is deployed against one.
  {
    await client.exec('DROP TABLE IF EXISTS "flights", "trips", "sessions", "users" CASCADE;');
    const signup = await makeClient().call("POST", "/api/auth/signup", {
      email: "empty@example.com",
      password: "a-good-password",
    });

    equal("a database with no tables is not a 500", signup.status, 503);
    check(
      "  and the error names the fix",
      String((signup.body as { error?: string } | undefined)?.error ?? "").includes("db:push"),
      signup.body,
    );

    await createSchema();
    const recovered = await makeClient().call("POST", "/api/auth/signup", {
      email: "empty@example.com",
      password: "a-good-password",
    });
    equal("and the checks after it still work", recovered.status, 200);
  }
}

/* ------------------------------------------------------------------ wrap up */

await client.close();

console.log("");
if (failures.length > 0) {
  console.error(`${failures.length} of ${passed + failures.length} API checks failed:`);
  for (const name of failures) console.error(`  - ${name}`);
  process.exit(1);
}
console.log(`all ${passed} API checks passed`);
