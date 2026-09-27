# Getting started

## Requirements

- [Bun](https://bun.sh) 1.4 or newer
- No API keys, no accounts, no `.env` configuration

## Run it

```bash
bun install
bun run dev
```

`bun run dev` starts all three parts of the app:

- `convex dev` — the Convex backend on a local deployment, watching for changes
- `vite` — the frontend on port 5173, bound to `0.0.0.0`
- `watch-packages` — nudges the Convex watcher when a shared package changes

On first run Convex provisions a **local** deployment and writes
`CONVEX_DEPLOYMENT`, `CONVEX_URL` and `CONVEX_SITE_URL` into `.env.local`. It
prints something like:

```
Configured a local deployment for http://127.0.0.1:3210
```

That is expected and requires no account. It creates a local backend rather
than connecting to Convex Cloud.

## Scripts

Run from the repository root.

| Command | What it does |
| --- | --- |
| `bun run dev` | Backend, frontend and the package watcher — the normal way to work |
| `bun run web` | Frontend only, if the backend is already running |
| `bun run backend` | Backend only |
| `bun run build` | Production build into `apps/web/dist` |
| `bun run typecheck` | TypeScript across the app and the shared packages |
| `bun run data:build` | Regenerate the aviation datasets from `packages/data/raw/` |
| `bun run check` | Run both harnesses below — the fastest confidence check in the repo |
| `bun run check:resolver` | Resolver harness: parse and top candidates for a spread of inputs |
| `bun run check:csv` | 35 assertions over CSV dates, header mapping and round-tripping |
| `bun run convex -- <cmd>` | The Convex CLI against this project |

In `apps/web`, `bun run dev:all` is the same as the root `dev`.

## Checking the resolver

The highest-risk code in the repo has a harness that needs nothing running:

```bash
bun run check:resolver
```

It prints the parse and the top candidates for a spread of free-text inputs.
Add a case to the list when you change the parser — see
[resolver.md](resolver.md#changing-the-resolver).

The CSV import is the other place with fiddly edge cases — ambiguous dates,
quoted commas, columns in a different order — so it has its own harness:

```bash
bun run check:csv
```

Both are plain scripts that exit non-zero on failure, so they drop into CI as
they are. There is no test runner wired up yet; see
[roadmap.md](roadmap.md#accounts-and-infrastructure).

## Type checking

```bash
cd apps/web && bunx tsc -b --noEmit --force
```

`-b` builds project references; `--force` ignores the incremental cache, which
is worth using after editing anything in `packages/`.

## How the browser reaches the backend

A local Convex deployment binds to `127.0.0.1`, which the user's browser cannot
reach — the browser talks to the preview server over HTTPS. Vite proxies
`/api` and `/.well-known` through to Convex, and the app builds its Convex
client from `window.location.origin`.

So if queries fail in the browser, check the proxy rather than the app.

## Troubleshooting

**The map is blank but the page loads.** Check the basemap endpoint directly:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tiles.openfreemap.org/styles/positron
```

A `200` means the provider is fine and the problem is in the layer setup. See
[map-tiles.md](map-tiles.md) for the full list.

**Queries fail with "Could not find public function".** The backend has not
pushed yet, or the path is wrong. `convex dev` prints the function list on
startup. Note that `convex/resolve.ts` exports a query named `resolve`, so its
path is `resolve:resolve`, not `resolve:default`.

**"Could not resolve @skytrace/..." from Convex.** The workspace packages must
be declared in the root `package.json` as well as the app's — Convex's bundler
resolves upward from `packages/`, not from `apps/web/node_modules`. See
[architecture.md](architecture.md#convex-codegen-and-a-monorepo).

**Auth errors mention a type code.** Convex Auth errors are prefixed with a
server-generated code. The UI translates the common cases; anything unrecognised
falls back to the message after the last colon.

**Backend changes have no effect.** `convex dev` only watches `apps/web/convex`.
The resolver actually lives in `packages/flight-core`, so editing it does not
trigger a re-push on its own. `bun run dev:all` starts a watcher that handles
this; if you ran `bun run backend` alone, restart it after changing a package.

**Port 3210 is already in use.** Another local Convex deployment is running, and
the new one will refuse to start. This usually means an orphaned backend from an
earlier session is still holding the port — the local backend writes to
`.convex/local`, and only one may own it at a time.

## Deploying

The build is static (`vite build` → `apps/web/dist`), which the hosting layer
can serve. **The backend is the catch.** A local Convex deployment stores its
data on the machine it runs on, so a production deploy needs a real Convex Cloud
project — connect one with `bunx convex dev --configure`, which replaces the
local deployment in `.env.local` with a cloud one and prints the values to add
to the production environment.

Until that is done, the deployed front end will render but will not be able to
save a flight, and data will not survive a redeploy.

## Data you cannot add

There are no secrets to manage, by design. The aviation dataset is compiled
into the repository and the basemaps are keyless. See
[map-tiles.md](map-tiles.md) for what a future flight-API integration would
need and where the key would live — a Convex action, not the browser bundle.
