# Environment variables

The app reads one variable it cannot run without, and two more that only matter
when the frontend and the API are on different hosts — which is how it is
deployed now. Everything else is derived.

| Variable | Where | Required | What it is |
| --- | --- | --- | --- |
| `DATABASE_URL` | API | In production | A Postgres connection string. The one thing the app cannot run without. |
| `ALLOWED_ORIGINS` | API | When split across hosts | Comma-separated list of frontend origins allowed to call the API. |
| `VITE_API_URL` | Build | When split across hosts | The API's base URL, baked into the frontend at build time. |
| `SEED_DEMO_PASSWORD` | API | No | Password for the demo account. Without it, no demo data is created. |
| `SEED_DEMO_EMAIL` | API | No | Who that account is. Defaults to `demo@skytrace.app`. |
| `API_PORT` | Development | No | The port the API listens on. Defaults to `3210`. |
| `API_ORIGIN` | Development | No | Overrides the address the Vite dev server proxies `/api` to. Rarely needed. |

The app currently runs with the frontend and the API on **different hosts**: the
frontend on Vercel, the API on Render. That needs the two variables in the
middle, and nothing else changes.

## DATABASE_URL

A standard Postgres connection string, from Neon or anywhere else that speaks
the protocol:

```
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

The API reaches Postgres over HTTP rather than over a TCP socket, using Neon's
`neon-http` driver. That is what lets the whole API run as a serverless
function: there is no connection to keep alive, and a function that sleeps
between requests costs nothing. The same driver works against any Postgres, so a
local database, a container, or a managed one are all the same code.

### Setting it

- **Locally** — Settings → Environment in this workspace, or the `.env.local`
  file at the repository root. It is loaded into the terminal and the preview
  automatically; you never need to `export` it.
- **In production** — the project's environment settings on the host.

### When it is missing

The app still starts, and this is deliberate. `/api/health` says so:

```json
{"ok":true,"database":"missing","remedy":"Set DATABASE_URL."}
```

and anything that needs a session answers with a 500 naming it:

> DATABASE_URL is not set. Point it at a Postgres connection string, then run
> `bun run db:push` to create the tables.

Everything that does not need a database keeps working: the landing page, the
resolver demo, the airport autocomplete, and the guest dashboard. A
misconfigured deployment therefore shows a working site with a broken sign-in
button, rather than a blank page and a stack trace.

The one thing to check first when nobody can sign in is:

```bash
curl -s https://your-api-host.example/api/health
```

`ready` means the connection works. `no-tables` means it works but the schema
has not been applied, and the response carries the command to run. `missing`
means the variable is not set. `unreachable` means the host cannot be reached
at all — DNS, TLS, or a suspended database.

## Running the frontend and API on different hosts

When the two are on the same origin — Vercel serving both, or the Vite dev
server proxying `/api` — there is nothing to configure. The browser calls
`/api/...` on its own origin and the session is a plain same-origin cookie.

Split across hosts, three things must line up, and all three fail *silently*
when they do not: the browser discards the response rather than reporting
anything, so the app looks merely broken.

**On the API (Render):** `ALLOWED_ORIGINS`

```
ALLOWED_ORIGINS=https://flightrace.vercel.app
```

Origins, not URLs-with-paths, comma-separated for more than one. This is an
allowlist, not a pattern, and `*` is refused: it would let any site on the
internet read this user's flight log using their session. A request from an
origin not on the list is answered without any CORS header, which the browser
then blocks.

An origin is scheme + host + port and nothing else, and it is the one the
*page* was loaded from — not the one a redirect lands on. Renaming a Vercel
project leaves the old domain answering with a `307` to the new one, and a
redirect does not change the `Origin` a browser sends: the old domain still
gets `403`, the new one gets `204`. If a deployment starts failing right after
a rename, this is the first thing to check.

**On the frontend (Vercel):** `VITE_API_URL`

```
VITE_API_URL=https://flight-visualizer.onrender.com
```

This one is read at **build** time, so it must be set in the project's
environment settings and the project redeployed — setting it after a build
changes nothing, and the symptom is the frontend still calling its own origin.

`ALLOWED_ORIGINS` also switches the session cookie to `SameSite=None; Secure`,
because a `Lax` cookie is never sent on a cross-site request. Sign-in would
otherwise appear to succeed and then forget you on the next page.

### Checking it worked

Two failures, two different curls. The preflight tells you whether the API is
willing to be called from the frontend's origin at all:

```bash
curl -s -i -X OPTIONS https://flight-visualizer.onrender.com/api/auth/signup \
  -H "Origin: https://flightrace.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-skytrace-client"
```

A `204` with `access-control-allow-origin` and
`access-control-allow-credentials: true` means `ALLOWED_ORIGINS` is right. A
`403` with no CORS header at all means it is not — and the browser would have
blocked the response without saying why.

Then a sign-in, which is a read as far as the database is concerned and tells
you whether the tables exist:

```bash
curl -s -X POST https://flight-visualizer.onrender.com/api/auth/signin \
  -H 'content-type: application/json' \
  -d '{"email":"nobody@example.invalid","password":"x"}'
```

`401` means the query ran. A `503` naming `db:push` means the schema is missing
— nothing is written either way.

From a browser signed out, the sign-in button on the deployed frontend should
then create an account. If it still fails, compare the two variables above
against what the browser actually sent: the **Network** tab shows the `Origin`
the request carried and whether the response had an `Access-Control-Allow-Origin`
header.

### The write needs one more header

`ALLOWED_ORIGINS` stops a hostile site *reading* this user's log. It does
nothing to stop a hostile site *writing* to it, because any site can send a
request that carries the user's cookie — it just cannot read the reply. So a
cross-origin write must also carry `x-skytrace-client: 1`, which forces a
preflight that a plain HTML form post cannot produce. See
`backend/server/cors.ts`.

## Creating the tables

The schema is defined once, in `backend/db/schema.ts`, and pushed with
[drizzle-kit](https://orm.drizzle.team/):

```bash
bun run db:push
```

`db:push` reads `DATABASE_URL` from the environment. It applies the schema
directly and asks before anything destructive, which is what you want for a
database you are developing against.

`bun run start` runs it for you before the server boots, so a host does not
need a release step. The push lives in the backend's own `start` script, so it
happens whichever way a host enters — `bun start` at the root or
`cd backend && bun start`. Two things about that arrangement are deliberate:

- The push is **not** fatal. A failed push prints its error into the host's
  logs and the server starts anyway, then `/api/health` reports what is
  actually wrong. A container that refuses to boot instead leaves nothing to
  diagnose, and on a free tier the restarts are slow.
- It is **not** destructive. `--force` is not passed, so a statement that would
  truncate a table is refused rather than applied to a flight log. In a
  non-interactive deploy drizzle-kit applies the additive changes and stops at
  anything that needs a human.

`drizzle-kit` is a devDependency, so the install has to include dev
dependencies — `bun install` does by default, and a host configured for
`--production` does not.

## Seeding the demo account

`start` runs a seeder after the push, which creates one account with a short
flight log — eight flights, a trip, and the derived figures that make the
dashboard worth looking at.

The reason is the free tier. The service is disposable and a fresh database is
empty, so without this a new deployment is a working app with an empty log: the
map draws nothing and every stat reads zero, which is indistinguishable from a
broken deployment without first signing in and logging a flight by hand.

Three things about it are deliberate:

- **Every number is derived, not typed in.** Distance, duration and CO₂ come
  from the same functions the add-flight route uses, and the coordinates from
  the compiled dataset. A seeded flight is indistinguishable from a real one,
  and an IATA code that does not exist fails at boot rather than producing a
  flight to nowhere.
- **It is additive and idempotent.** It does nothing at all if the account
  already exists, so it is safe on every restart and will never touch a real
  log. There is no update path and no delete path: a seeder that can overwrite
  is a seeder that can lose data.
- **The password comes from the environment.** A demo account with a committed
  password is an account anybody on the internet can sign in to. With no
  `SEED_DEMO_PASSWORD` set the seeder does nothing and says why, so a
  deployment without a demo account is a normal, supported thing.

```bash
SEED_DEMO_PASSWORD=choose-something-you-havent-used bun run db:seed
```

`db:seed` runs the seeder on its own, which is also how you add the account to
an existing database. The one thing to do afterwards is change the password from
inside the app.

A failure here never stops the server booting: the error is logged, `start`
continues, and `/api/health` reports whatever is actually wrong. A seeder that
takes the service down with it is worse than one that does not run.

`bun run db:generate` writes a SQL migration file under `backend/db/migrations`
instead, for when you want the change reviewed in a diff before it reaches a
shared database. Neither is needed at runtime: the running API never loads
migration tooling.

## What there is not

There are no API keys, no signing secrets, and no third-party auth provider.

The previous version of this app used Convex Auth, which needed a private key
and a JWKS endpoint to be generated before sign-in worked at all — a failure
that produced no build error and no startup error, only a button that did
nothing. Sessions here are a random token in an `HttpOnly` cookie, and the
token is stored only as a SHA-256 hash, so there is no signing key to
provision, rotate, or leak.

If an email-verification or password-reset flow is added later, that is when an
email provider becomes necessary — and it is the only thing in this list that
would need an account with somebody else.
