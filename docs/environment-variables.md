# Environment variables

The app reads exactly one variable. Everything else is derived.

| Variable | Where | Required | What it is |
| --- | --- | --- | --- |
| `DATABASE_URL` | API | In production | A Postgres connection string. The one thing the app cannot run without. |
| `API_PORT` | Development | No | The port the API listens on. Defaults to `3210`. |
| `API_ORIGIN` | Development | No | Overrides the address the Vite dev server proxies `/api` to. Rarely needed. |

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
