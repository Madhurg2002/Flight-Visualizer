# Getting started

## Requirements

- [Bun](https://bun.sh) 1.4 or newer
- No API keys and no accounts for the default setup

A Postgres connection string is needed to keep a flight log. To run the app
with none at all — everything except sign-in and saving — see
[Running without a database](#running-without-a-database) below.

## Run it

```bash
bun install
bun run dev
```

`bun run dev` starts both halves:

- the **API** on port 3210 — routes, sessions, and Postgres
- `vite` on port 5173, bound to `0.0.0.0`, proxying `/api` to the API

The first time you run it against a real database, create the tables:

```bash
bun run db:push
```

It reads the connection string from the environment, applies the schema from
`backend/db/schema.ts`, and asks before doing anything destructive.

## Running the API on its own

```bash
cd backend
bun start
```

`start` is the production entry point: plain Node, no hot reload, no Bun
requirement, and it binds `0.0.0.0`. It reads `PORT` first and `API_PORT`
second, because hosts disagree about which of those they inject. It is the
command a deployment platform's "start command" field should hold, and the same
code the Vercel function runs.

`bun start` and `node server/start.ts` are the same thing — the script is
plain `node:http`, so either runtime serves it.

If it reports the port is already in use, the development API is probably still
running from `bun run dev`. Find it with `ss -ltnp | grep 3210`.

## Running without a database

To work on the frontend with nothing set up:

```bash
bun run --cwd frontend dev:all:memory
```

That starts the same API against a Postgres running inside the process.
Sign-up, saving, trips, import and stats all work; the data is discarded when
the process exits, so do not put anything in it that you want to keep.

## Scripts

Run from the repository root.

| Command | What it does |
| --- | --- |
| `bun run dev` | API and frontend together — the normal way to work |
| `bun run web` | Frontend only, if the API is already running |
| `bun run api` | API only |
| `cd backend && bun start` | The API as a plain Node server, without hot reload — what a host runs |
| `bun run build` | Production build into `frontend/dist` |
| `bun run typecheck` | TypeScript across the app and the shared packages |
| `bun run data:build` | Regenerate the aviation datasets from `common/data/raw/` |
| `bun run check` | Run the three harnesses below — the fastest confidence check in the repo |
| `bun run check:resolver` | Resolver harness: parse and top candidates for a spread of inputs |
| `bun run check:csv` | 34 assertions over CSV dates, header mapping and round-tripping |
| `bun run check:api` | 104 assertions over the real API, against an in-process Postgres |
| `bun run db:push` | Create or update the tables from `backend/db/schema.ts` |
| `bun run db:generate` | Write a reviewable SQL migration instead of applying it directly |

## Checking the resolver

The highest-risk code in the repo has a harness that needs nothing running:

```bash
bun run check:resolver
```

It parses a spread of half-remembered inputs and prints the top candidates with
the reason for each, so a regression in ranking is visible by reading the
output rather than by clicking through the UI.

## Checking the API

`bun run check:api` boots a Postgres inside the process and drives the real
route handlers through the real HTTP entry point — sign-up, sign-in, sign-out,
add, edit, delete, bulk import, stats, trips, ownership, and the error cases.
It needs no server, no connection string and no secrets, so it runs in CI.

That harness is why the database half of this project is not untested code: it
was written before a real connection string existed, and it is the reason the
foreign keys, enums and date handling are known to be right.

## Checking the dataset stayed out of the browser

The aviation dataset is roughly 1.2MB of airport records that must never be
shipped to a browser, and whether it leaks is a property of the built bundle
rather than of the source. A refactor that adds a careless import would still
typecheck cleanly; this is what catches it.

## How the browser reaches the API

The browser only ever talks to its own origin. In development Vite proxies
`/api` to the API process; in production one deployment serves both. The
client has no API URL to configure, and no environment variable controls one.

To see what the API itself thinks:

```bash
curl -s localhost:3210/api/health
```

`{"ok":true,"database":"configured"}` means everything is wired up.
`"database":"missing"` means the connection string is not set, and it is the
reason sign-in does nothing.

## Troubleshooting

**The map is blank but the page loads.** Check the basemap endpoint directly:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tiles.openfreemap.org/styles/positron
```

A `200` means the provider is fine and the problem is in the layer setup. See
[map-tiles.md](map-tiles.md) for the full list.

**Nothing can be signed in to, and nothing can be saved.** Almost always a
missing connection string. Check `/api/health` first — the error message names
the variable and the command to run.

**"relation \"flights\" does not exist".** The schema has not been created. Run
`bun run db:push`.

**An API request returns 500 with an unfamiliar message.** The server logs the
real error; the client is only told something went wrong, deliberately, because
an unexpected error's message usually contains a query or a file path. Run the
API in the foreground and read its output.

**"Address already in use" on port 3210.** An orphaned API from an earlier
session is still holding the port. Find it with `ss -ltnp | grep 3210`, then
stop that process.

## Deploying

The app deploys as one unit on Vercel: `vercel.json` builds the static frontend
and serves the API from `api/[...path].ts`, both on one origin. The database is
[Neon](https://neon.tech) Postgres, which is serverless and scales to zero, so
nothing is left running when the app is not.

1. Create a Neon project and copy its connection string.
2. Push the repository to Vercel and set `DATABASE_URL` in the project's
   environment settings.
3. Run `bun run db:push` locally against that same connection string to create
   the tables.

That is the whole list. There is no auth provider to configure, no signing key
to generate, and no migration step that has to run on every deploy.

## Data you cannot add

There are almost no secrets to manage, by design. The aviation dataset is
compiled into the repository, the basemaps are keyless, and sessions need no
signing key. The only variable is the database connection string — see
[environment-variables.md](environment-variables.md). A future flight-API
integration would need a key, and it would live in the API rather than in the
browser bundle; see [map-tiles.md](map-tiles.md).
