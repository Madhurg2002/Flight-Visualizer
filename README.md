# Skytrace

A personal flight log. Describe a flight the way you would say it out loud,
and Skytrace works out which flight you meant and draws it on a world map.

```
"United to Tokyo in March 2025"
```

The aviation data is a public dataset compiled into the repo and the basemaps
are keyless public tiles, so **there is nothing to sign up for and no key to
configure.** `bun install && bun run dev` is the whole setup.

## What it does

- **Free-text flight resolution.** Airline names, city names, IATA and ICAO
  codes, partial dates and route pairs, ranked into candidates with a stated
  confidence and the reason behind it. When it is unsure, it says so and asks
  rather than guessing — see [the resolver](docs/resolver.md).
- **A flight log.** Trips, ratings, seat and cabin, cost, notes, duplicate
  detection that offers rather than blocks, and CSV import and export.
- **A map that earns its place.** Great-circle arcs drawn on the sphere,
  coloured by year, cabin, distance or airline, with timeline playback and PNG
  export. Six free basemaps, no key.
- **Statistics that follow from the log.** Distance, time aloft, cabin-aware
  CO₂, spend per kilometre, superlatives, and repeated routes.

Full feature-by-feature status, including what is deliberately not built, is
in [docs/capabilities.md](docs/capabilities.md).

## Quick start

Requires [Bun](https://bun.sh) 1.4 or newer. No API keys, no accounts, no
environment configuration.

```bash
bun install
bun run dev
```

That starts the API and Vite, with Vite proxying `/api` to the API. To keep a
flight log, point `DATABASE_URL` at a Postgres database; `bun run db:push`
creates the tables, and `bun run start` does it for you before the server
binds its port. To click around without any database at all,
`bun run --cwd frontend dev:all:memory` runs the same API against one inside
the process.

| Command | What it does |
| --- | --- |
| `bun run dev` | The API and the frontend together |
| `bun run start` | The production API, applying the schema first |
| `bun run check` | Three harnesses — the fastest confidence check in the repo |
| `bun run typecheck` | TypeScript across the app and the shared packages |
| `bun run build` | Production build into `frontend/dist` |
| `bun run data:build` | Regenerate the aviation datasets from `common/data/raw/` |

More, including troubleshooting, is in
[docs/getting-started.md](docs/getting-started.md).

## Layout

```
backend/     The API: routes, sessions, and the Postgres schema
api/         The optional single-origin serverless entry point for those routes
frontend/    The Vite + React app the browser runs
common/      types, flight-core, data and ui — imported by both halves
docs/        The documentation below
```

`common` holds four packages: `types` (the domain model), `flight-core` (the
parser, resolver, geometry and emissions — all pure), `data` (the generated
datasets) and `ui` (Tailwind primitives). Nothing crosses backwards: `backend`
never imports `frontend`, and `common` imports neither.

## Documentation

Every document is written to be read by someone who did not build it.

| Document | What it answers |
| --- | --- |
| [getting-started.md](docs/getting-started.md) | Running it locally, the scripts, and troubleshooting |
| [environment-variables.md](docs/environment-variables.md) | Every environment variable, what it is for, and what breaks without it |
| [capabilities.md](docs/capabilities.md) | What the app can actually do today, feature by feature |
| [resolver.md](docs/resolver.md) | How "United to Tokyo in March" becomes a specific flight |
| [architecture.md](docs/architecture.md) | How the monorepo is laid out, and why |
| [data-sources.md](docs/data-sources.md) | Where the aviation data comes from and how to regenerate it |
| [map-tiles.md](docs/map-tiles.md) | The free, keyless basemap providers and how to add one |
| [roadmap.md](docs/roadmap.md) | What is done, what is not started |
| [author.md](docs/author.md) | Who built it and how to reach them |

## Stack

Bun workspaces, Vite 6, React 19, TypeScript, Tailwind CSS v4, Postgres via
Drizzle ORM over Neon's serverless driver, deck.gl 9 over MapLibre GL 5,
React Router 7. Deployed as three pieces: the static frontend on Vercel, the
API on Render, Neon Postgres behind both.

## Two things worth knowing up front

**The resolver never confidently guesses.** A flight log is only worth anything
if the routes on it are real, so every candidate carries its confidence and its
reason, and an unresolved input produces an honest question. One gap is stated
plainly: OpenFlights has routes but not schedules, so a flight number alone
cannot be mapped to a route offline.

**Derived values are snapshotted.** Distance, duration and CO₂ are computed once
at save time and stored. A log is history, and re-deriving a 2019 entry against
changed data would quietly alter what the user remembers.

## Licensing

The **code** is [MIT](LICENSE) — the short permissive licence that maximises the
chance anyone actually uses it.

The **aviation data** is a separate matter. The files under `common/data/` come
from [OpenFlights](https://github.com/jpatokal/openflights) and are under the
**Open Database License (ODbL)**, derived partly from OpenStreetMap. The ODbL is
copyleft for data and is *not* compatible with MIT, so it is carved out
explicitly rather than papered over: see [common/data/LICENSE](common/data/LICENSE).
Redistributing the data, or a database derived from it, means keeping it under
the ODbL and carrying the attribution, which the app already renders. Re-read
the share-alike terms before any commercial use.

Basemap providers each carry their own attribution requirements, shown on the
map itself — see [docs/map-tiles.md](docs/map-tiles.md).

## Author

Built by **Madhur Gupta** — Full Stack Developer at Qen Labs, working on
geospatial and realtime systems. [github.com/Madhurg2002](https://github.com/Madhurg2002)
