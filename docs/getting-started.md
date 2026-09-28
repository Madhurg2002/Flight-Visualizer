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

It also runs `db:push` first, so a host does not need a release step to create
the tables — see [environment-variables.md](environment-variables.md#creating-the-tables)
for what that does and does not do.

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
| `bun run start` | The API as a plain Node server, without hot reload, applying the schema first — what a host runs. `cd backend && bun start` is the same thing |
| `bun run build` | Production build into `frontend/dist` |
| `bun run typecheck` | TypeScript across the app and the shared packages |
| `bun run data:build` | Regenerate the aviation datasets from `common/data/raw/` |
| `bun run check` | Run the three harnesses below — the fastest confidence check in the repo |
| `bun run check:resolver` | Resolver harness: parse and top candidates for a spread of inputs |
| `bun run check:csv` | 34 assertions over CSV dates, header mapping and round-tripping |
| `bun run check:api` | 170 assertions over the real API, against an in-process Postgres |
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

There are two arrangements, and the client is written to work in both.

**One origin.** In development Vite proxies `/api` to the API process, and a
single Vercel deployment serves the static frontend and the `api/[...path].ts`
function together. The browser calls `/api/...` on its own origin and there is
no API URL to configure at all.

**Split across hosts.** The app is currently deployed that way: the frontend on
Vercel, the API on Render. Two variables switch it on, and the client reads
`VITE_API_URL` at build time — see
[environment-variables.md](environment-variables.md#running-the-frontend-and-api-on-different-hosts)
for both of them and for what breaks if only one is set. Requests then carry the
session cookie cross-origin, which is why the API also needs to be told which
origins may call it.

To see what the API itself thinks:

```bash
curl -s localhost:3210/api/health
```

| `database` | What it means |
| --- | --- |
| `ready` | Connected, and a query round-tripped |
| `no-tables` | Connected, but the schema has not been applied — the response carries `remedy` |
| `unreachable` | Cannot reach it at all — DNS, TLS, a suspended branch |
| `missing` | `DATABASE_URL` is not set, and it is the reason sign-in does nothing |

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

**"The database is reachable but the tables have not been created."** The
schema has not been applied. `start` does this for you, so this means the
service booted without the push — check the deploy log, then run
`bun run db:push` against the same `DATABASE_URL` by hand.

**Sign-in fails only on the deployed site, and the console shows a CORS
error.** The frontend and the API are on different hosts, so `ALLOWED_ORIGINS`
on the API and `VITE_API_URL` on the frontend both have to be set — and the
latter needs a redeploy. See
[environment-variables.md](environment-variables.md#running-the-frontend-and-api-on-different-hosts).

**An API request returns 500 with an unfamiliar message.** The server logs the
real error; the client is only told something went wrong, deliberately, because
an unexpected error's message usually contains a query or a file path. Run the
API in the foreground and read its output. A database problem is the exception:
those are recognised and answered with the one thing to do next, as a 503.

**"Address already in use" on port 3210.** An orphaned API from an earlier
session is still holding the port. Find it with `ss -ltnp | grep 3210`, then
stop that process.

## Deploying

The current deployment is three pieces, because each is best served by
something that does that one thing well:

| Piece | Where | Why there |
| --- | --- | --- |
| Frontend | Vercel | A static bundle. It is `dist/` and nothing else. |
| API | Render | A long-lived Node process, which is what `start` is. |
| Database | [Neon](https://neon.tech) Postgres | Serverless; scales to zero, so an idle app costs nothing. |

1. Create a Neon project and copy its connection string.
2. Deploy the repository to Render as a Node service. Build command
   `bun install`, start command `bun run start`, and `DATABASE_URL` in the
   service's environment. `start` applies the schema before the server binds
   its port, so there is no release step.
3. Deploy the repository to Vercel. `vercel.json` builds the static frontend
   and serves the API from `api/[...path].ts`.
4. Because the two are now on different hosts, set `ALLOWED_ORIGINS` on Render
   and `VITE_API_URL` on Vercel — and redeploy Vercel, because that one is read
   at build time.

There is no auth provider to configure and no signing key to generate. Step 4
is the only part that is easy to get wrong, and it fails *silently*: the
browser discards a response it is not allowed to read, so the app looks merely
broken rather than reporting a CORS error. See
[environment-variables.md](environment-variables.md#running-the-frontend-and-api-on-different-hosts),
which has the exact curl to tell the two settings apart.

One deployment can serve both halves on one origin — the `api/` function is
there for exactly that — and steps 3–4 are what you skip if you want it.

### One project setting that is easy to get wrong

Leave **Root Directory** empty, so the build runs from the repository root.

Vercel reads `vercel.json` from the root of the repository, but it runs the
commands from whatever *Root Directory* says — and if that is `frontend`, the
build looks for `frontend/frontend` and stops with:

```
ENOENT: No such file or directory: Could not change directory to "frontend" (chdir)
```

`outputDirectory` is spelled `frontend/dist` for the same reason: it is
relative to the root directory too. Setting Root Directory to `frontend` and
fixing the two paths to compensate is possible, but then the serverless
function in `api/` is outside the project and never deploys.

## Data you cannot add

There are almost no secrets to manage, by design. The aviation dataset is
compiled into the repository, the basemaps are keyless, and sessions need no
signing key. The only variable is the database connection string — see
[environment-variables.md](environment-variables.md). A future flight-API
integration would need a key, and it would live in the API rather than in the
browser bundle; see [map-tiles.md](map-tiles.md).
