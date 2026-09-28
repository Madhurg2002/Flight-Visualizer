import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { setDbOverride } from "../db/client.ts";
import * as schema from "../db/schema.ts";
import { handleRequest } from "../server/router.ts";

/**
 * The API with an in-process Postgres behind it.
 *
 * The same route handlers, the same SQL and the same validation as production —
 * the only difference is that the data lives in this process and is thrown away
 * when it exits. It exists so the app can be run, and demonstrated, with no
 * database at all: useful for working on the frontend, and for checking a
 * change end to end before it is pointed at a real Neon project.
 *
 * Do not use it to keep anything. `bun run dev` is the real thing.
 */

const SQL_TYPES: Record<string, string> = {
  text: "text",
  varchar: "varchar",
  integer: "integer",
  real: "real",
  "double precision": "double precision",
  bigint: "bigint",
  date: "date",
};

const TABLES: PgTable[] = [schema.users, schema.sessions, schema.trips, schema.flights];

function sqlTypeOf(name: string): string | undefined {
  return SQL_TYPES[name] ?? SQL_TYPES[name.replace(/^pg_catalog\./, "")];
}

const client = new PGlite();
const db = drizzle(client, { schema });
setDbOverride(db);

const enums = new Set<string>();
const enumStatements: string[] = [];
for (const table of TABLES) {
  for (const column of getTableConfig(table).columns) {
    const type = column.getSQLType();
    if (!column.enumValues?.length || enums.has(type)) continue;
    enums.add(type);
    enumStatements.push(`CREATE TYPE "${type}" AS ENUM (${column.enumValues.map((v) => `'${v}'`).join(", ")});`);
  }
}
await client.exec(enumStatements.join("\n"));

for (const table of TABLES) {
  const config = getTableConfig(table);
  const parts: string[] = [];

  for (const column of config.columns) {
    if (column.enumValues?.length) {
      parts.push(`  "${column.name}" ${column.getSQLType()}`);
      continue;
    }
    const type = sqlTypeOf(column.getSQLType());
    if (!type) throw new Error(`No SQL type known for ${config.name}.${column.name}`);
    parts.push(`  "${column.name}" ${type}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}`);
  }

  for (const fk of config.foreignKeys) {
    const reference = fk.reference() as unknown as {
      columns: { name: string }[];
      foreignTable: PgTable;
      foreignColumns: { name: string }[];
    };
    parts.push(
      `  FOREIGN KEY (${reference.columns.map((c) => `"${c.name}"`).join(", ")}) ` +
        `REFERENCES "${getTableConfig(reference.foreignTable).name}" ` +
        `(${reference.foreignColumns.map((c) => `"${c.name}"`).join(", ")}) ON DELETE ${fk.onDelete}`,
    );
  }

  await client.exec(`CREATE TABLE IF NOT EXISTS "${config.name}" (\n${parts.join(",\n")}\n);`);
}

for (const table of TABLES) {
  const config = getTableConfig(table);
  for (const index of config.indexes) {
    const name = index.config.name;
    if (!name) continue;
    const columns = index.config.columns
      .map((c) => (typeof c === "string" ? c : c.name))
      .filter((c): c is string => typeof c === "string")
      .map((c) => `"${c}"`)
      .join(", ");
    if (columns === "") continue;
    await client.exec(`CREATE INDEX IF NOT EXISTS "${name}" ON "${config.name}" (${columns});`);
  }
}
await client.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_key" ON "users" (lower("email"));`);

const port = Number(process.env.API_PORT ?? 3210);
const server = Bun.serve({ port, hostname: "0.0.0.0", fetch: handleRequest });

console.log(`API (in-memory Postgres, data is discarded on exit) on http://${server.hostname}:${server.port}`);
