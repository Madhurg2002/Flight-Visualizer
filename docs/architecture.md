# Architecture

## Layout

```
skytrace/
├── backend/                     Everything that runs on the server
│   ├── convex/                  Convex functions (also the source of codegen)
│   │   ├── _generated/          Convex codegen output — never edit
│   │   ├── schema.ts            Tables and indexes
│   │   ├── auth.ts              Convex Auth: password provider
│   │   ├── flights.ts           List, add, update, remove, stats
│   │   ├── resolve.ts           The resolver query (the only place routes load)
│   │   ├── trips.ts             Trip grouping
│   │   ├── users.ts             Current user's email
│   │   └── http.ts              Convex Auth HTTP routes
│   └── scripts/                 watch-packages.ts
├── frontend/                    Everything the browser runs
│   ├── index.html
│   ├── vite.config.ts
│   ├── scripts/                 check-csv.ts
│   └── src/
│       ├── components/          Map, list, panels, globe
│       ├── lib/                 Convex client, auth, theme, basemap registry
│       └── pages/               Landing, auth, dashboard
└── common/                      Code both sides import
    ├── types/                   Domain types, no runtime dependencies
    ├── flight-core/             Pure logic: geometry, parser, resolver, emissions
    ├── data/                    Generated aviation datasets + lookups
    └── ui/                      Button, Input, Label, Select, Textarea
```

`backend` and `frontend` are the two halves of the app and are named for
what they are, so it is obvious at a glance which side a file belongs to.
`common` holds the four packages that both halves import. Nothing crosses
backwards: `backend` never imports from `frontend`, and `common` never
imports from either.

## The four common packages

**`types`** holds the domain model — `FlightLog`, `FlightCandidate`,
`FlightStats` — with no runtime dependencies at all, so both the Convex
functions and the React components can import it. It is why `FlightLog` types
its `id` as a plain `string`: the generated Convex `Id<"flights">` type does
not exist outside the app, and a shared package must not depend on codegen.
`FlightList` narrows it back with a single documented cast.

**`flight-core`** is where the interesting decisions live. Every function is
pure and side-effect free, which is what makes the resolver testable without a
database, a network or a browser. `resolveFlight` takes its route table as an
argument rather than importing it, so the same code runs in a test harness.

**`data`** owns the generated datasets and all lookups over them: exact
airport resolution, fuzzy airport and airline search, and the lazily-built name
indexes the parser uses. The route table is imported only by
`convex/resolve.ts` and is not re-exported from the entry point, so it stays out
of the browser bundle.

**`ui`** is a small set of Tailwind-styled primitives with no knowledge of
flights.

## Data flow

```
User types "United to Tokyo in March 2025"
  │
  ├─ useQuery(api.resolve.resolve)  ──►  convex/resolve.ts
  │                                     │
  │                                     ├─ parseFlightInput()      pure
  │                                     └─ resolveFlight()         pure
  │                                          └─ routeRows (66,933)   server only
  │
  └─◄── ResolveResult: ranked candidates, each with a reason
         │
         ├─ user picks one, or corrects the form
         └─ useMutation(api.flights.add)  ──►  convex/flights.ts
                                                  ├─ validates both airports exist
                                                  ├─ checks for a duplicate
                                                  └─ computes + stores distance,
                                                     duration and CO₂
  │
  └─ reactive query api.flights.list updates the map, list and stats
```

Queries are the only read path, and they are reactive — a mutation invalidates
them and the map, the list and the stats all update together. Nothing is
duplicated into client state.

## Decisions worth explaining

### Convex runs locally, and the browser cannot reach it

A local Convex deployment binds to `127.0.0.1`, which is reachable from the
sandbox but **not** from the user's browser, which talks to the preview server
over HTTPS. Left alone, the frontend would be a beautiful page that could not
query anything.

So Vite proxies `/api` and `/.well-known` through to the Convex deployment
(`frontend/vite.config.ts`), and the app always constructs its Convex client from
`window.location.origin`. One code path in the app, correct in both places.

The preview command runs `convex dev` alongside Vite, because
`convex dev --once` starts a local backend, pushes, and exits — leaving nothing
listening. A third process watches the shared packages, because `convex dev`
only watches its own functions directory and would otherwise serve stale
resolver code after an edit in `common/flight-core`.

### Convex codegen and a monorepo

Convex's bundler resolves the real path behind a workspace symlink and then
cannot find sibling packages from there, because the packages resolve upward
from `common/`, not from `frontend/node_modules`. The fix is to declare the
workspace packages as dependencies of the **root** `package.json` as well, so
`<root>/node_modules/@skytrace/*` exists. That one change is what lets the
backend bundle `flight-core`, `data` and the 680KB route table.

A related trap: `convex dev` watches only `backend/convex`. The interesting
code is in `common/`, so editing the resolver produces no re-push and the
deployment quietly serves the previous version. `backend/scripts/watch-packages.ts`
closes the gap by touching a file in the functions directory when a package
changes.

### Light and dark are one stylesheet, not two

The palette lives in `frontend/src/index.css` as plain custom properties
(`--paper-50`, `--ink-500`, `--chart-600`, …) declared twice: once on `:root`
for the printed sheet, once on `.dark` for the same chart at night. A single
`@theme inline` block points Tailwind's colour utilities at those variables.

`@theme inline` rather than plain `@theme` is the whole trick. A normal
`@theme` **bakes each value into the utility** — `bg-paper-100/40` compiles
down to a literal `#fdfbf666` — so any colour used with an alpha modifier
could never follow a runtime switch. Inlining keeps the utility as
`color-mix(in oklab, var(--paper-100) 40%, transparent)`, which resolves when
it is painted. Every `/opacity` usage in the app therefore themes for free,
and there is not a single `dark:` variant class in the codebase.

Dark mode keys off a class on `<html>`, not the media query, so the header
toggle can override what the operating system asks for. A short inline script
in `index.html` applies the stored choice *before first paint*; doing it from
React instead means the page paints in the default theme and then visibly
swaps on every load.

The dark palette is not the light one with the brightness pulled down. On
paper the prominent end of each scale is the dark end, so `chart-700` is the
deepest magenta; on a dark sheet the prominent end is the light one, so the
night values run the other way and `chart-700` is the brightest. Both
palettes were checked against every surface they are actually used on —
body text, headings, muted text, the primary button, tinted chips, the
eyebrow and the headline gradient — and both clear WCAG AA.

### Two entry points into `flight-core`

`flight-core` exports from two files, and the split is load-bearing.
`@skytrace/flight-core` is the browser-safe surface — formatters and geometry
only. `@skytrace/flight-core/server` adds the parser and the resolver, which
import `@skytrace/data` and its 1.9MB of airport and airline records.

A single barrel re-exporting everything meant that importing `formatDistance`
in a React component pulled the whole dataset into the client bundle. The
backend imports the `/server` entry point; nothing in `src/` does.

The map itself is a third, lazy chunk. deck.gl and MapLibre are 1.9MB between
them and only the dashboard renders a map — the landing page uses a
hand-drawn SVG globe — so `FlightMap` is `React.lazy` and the map vendor chunk
is never fetched by a visitor who has not signed in.

### Derived values are snapshotted

Distance, duration and CO₂ are computed on write and stored. A log is history;
re-deriving a 2019 entry against changed data or a revised emissions model
would silently alter what the user remembers. See
[data-sources.md](data-sources.md#derived-values-and-why-they-are-snapshotted).

### Sign-up and sign-in stay separate

Convex Auth's password provider reports a wrong password and an existing
account the same way. Falling back from sign-in to sign-up would turn "wrong
password" into a confusing "that account already exists", so the two flows are
explicit and errors are translated per flow.

### `RequireAuth` carries the destination

An unauthenticated visit to `/dashboard` redirects to
`/auth?returnTo=/dashboard`, and `/auth` navigates there after sign-in. The
fallback is `/dashboard`, never the landing page — a signed-in user should not
land on marketing because they followed an old link.

### Password auth, no verification email

Verification needs an outbound email provider and an API key, which would put a
wall in front of the first-run experience. A flight log is a personal record
until it is published, so the trade is acceptable for now. Password reset is on
the [roadmap](roadmap.md#accounts-and-infrastructure).

## Stack

| Concern | Choice |
| --- | --- |
| Monorepo | Bun workspaces |
| Frontend | Vite 6, React 19, TypeScript, Tailwind CSS v4 |
| Routing | React Router 7 |
| Backend and database | Convex 1.46 |
| Auth | Convex Auth (`@convex-dev/auth`) |
| Map rendering | deck.gl 9 over MapLibre GL 5 |
| Basemaps | Keyless public tiles — see [map-tiles.md](map-tiles.md) |
| Animation | Motion (`motion/react`) |
| Icons | lucide-react |

deck.gl rather than Kepler.gl: Kepler is a complete exploration application
with its own state management and its own visual language, which fights a
custom-themed product. deck.gl is the layer engine Kepler is built on, so the
great-circle arcs and the full control over appearance come without adopting a
second app.

## Data model

```
users            (Convex Auth)
flights          userId, airlineCode, airlineName, flightNumber, flightDate,
                 fromIata, toIata, distanceKm, durationMin, co2Kg,
                 aircraft, tailNumber, cabin, seat, costMinor, currency,
                 rating, notes, source, tripId, loggedAt
                   indexed by (userId) and (userId, flightDate)

trips            userId, name, startDate, endDate, createdAt
                   indexed by (userId)
```

`flightDate` is a `yyyy-mm-dd` string, not a timestamp, so it can never be
shifted a day by a timezone. `costMinor` is integer minor units, so money never
drifts. `tripId` references `trips` and `flights` references `trips` in the
other direction; the schema does not model the reverse link, so there is no
circular dependency to resolve.
