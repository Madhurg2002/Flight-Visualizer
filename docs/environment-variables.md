# Environment variables

The app reads exactly one variable. Everything else is derived.

| Variable | Where | Required | What it is |
| --- | --- | --- | --- |
| `DATABASE_URL` | API | In production | A Postgres connection string. The one thing the app cannot run without. |
| `ALLOWED_ORIGINS` | API | When split across hosts | Comma-separated list of frontend origins allowed to call the API. |
| `VITE_API_URL` | Build | When split across hosts | The API's base URL, baked into the frontend at build time. |
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

The app still starts, and this is deliberate. `/api/health` reports
`{"database":"missing"}`, and anything that needs a session answers with:

> DATABASE_URL is not set. Point it at a Postgres connection string, then run
> `bun run db:push` to create the tables.

Everything that does not need a database keeps working: the landing page, the
resolver demo, the airport autocomplete, and the guest dashboard. A
misconfigured deployment therefore shows a working site with a broken sign-in
button, rather than a blank page and a stack trace.

The one thing to check first when nobody can sign in is:

```bash
curl -s https://your-deployment.example/api/health
```

## Running the frontend and API on different hosts

When the two are on the same origin — Vercel serving both, or the Vite dev
server proxying `/api` — there is nothing to configure. The browser calls
`/api/...` on its own origin and the session is a plain same-origin cookie.

Split across hosts, three things must line up, and all three fail *silently*
when they do not: the browser discards the response rather than reporting
anything, so the app looks merely broken.

**On the API (Render):** `ALLOWED_ORIGINS`

```
ALLOWED_ORIGINS=https://flight-visualizer-frontend-cyan.vercel.app
```

Origins, not URLs-with-paths, comma-separated for more than one. This is an
allowlist, not a pattern, and `*` is refused: it would let any site on the
internet read this user's flight log using their session. A request from an
origin not on the list is answered without any CORS header, which the browser
then blocks.

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

```bash
curl -s https://flight-visualizer.onrender.com/api/health
```

Then, from a browser signed out, the sign-in button on the deployed frontend
should create an account. If it fails, the two variables above are the first
thing to compare against what the browser actually sent — the **Network** tab
shows the `Origin` the request carried, and whether the response had an
`Access-Control-Allow-Origin` header.

## Creating the tables

The schema is defined once, in `backend/db/schema.ts`, and pushed with
[drizzle-kit](https://orm.drizzle.team/):

```bash
bun run db:push
```

`db:push` reads `DATABASE_URL` from the environment. It applies the schema
directly and asks before anything destructive, which is what you want for a
database you are developing against.

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
