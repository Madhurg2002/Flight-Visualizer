# Architecture

## Layout

```
skytrace/
├── backend/                     Everything that runs on the server
│   ├── db/
│   │   ├── schema.ts            Tables, indexes and enums (Drizzle)
│   │   ├── client.ts            The Postgres connection
│   │   └── migrations/          Written by `db:generate`; not committed
│   ├── server/
│   │   ├── router.ts            The routing table and error handling
│   │   ├── http.ts              JSON, cookies, argument reading, date checking
│   │   ├── session.ts           Who is making this request
│   │   ├── password.ts          scrypt hashing, session tokens
│   │   ├── dev.ts               The development server
│   │   ├── node-adapter.ts      Node request/response ↔ fetch
│   │   └── routes/              auth, flights, trips, resolve
│   ├── scripts/                 check-api.ts, dev-memory-db.ts
│   └── drizzle.config.ts        Migration tooling; unused at runtime
├── api/                         The Vercel function entry point
│   └── [...path].ts             Every /api/* route — and nothing else
├── frontend/                    Everything the browser runs
│   ├── index.html
│   ├── vite.config.ts
│   ├── scripts/                 check-csv.ts
│   └── src/
│       ├── components/          Map, list, panels, globe
│       ├── lib/                 Data client, auth, theme, basemap registry
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
`FlightStats` — with no runtime dependencies at all, so both the API routes and
the React components can import it. It is why `FlightLog` types its `id` as a
plain `string` and its optional fields as `T | null`: a shared package cannot
depend on a database's generated types, and writing it this way is why the move
from Convex to Postgres did not have to change a single one of these types.

**`flight-core`** is where the interesting decisions live. Every function is
pure and side-effect free, which is what makes the resolver testable without a
database, a network or a browser. `resolveFlight` takes its route table as an
argument rather than importing it, so the same code runs in a test harness.

**`data`** owns the generated datasets and all lookups over them: exact
airport resolution, fuzzy airport and airline search, and the lazily-built name
indexes the parser uses. The route table is imported only by
`server/routes/resolve.ts` and is not re-exported from the entry point, so it
stays out of the browser bundle.

**`ui`** is a small set of Tailwind-styled primitives with no knowledge of
flights.

## Data flow

```
User types "United to Tokyo in March 2025"
  │
  ├─ useQuery(api.resolve.resolve)  ──►  /api/resolve ──►  routes/resolve.ts
  │                                     │
  │                                     ├─ parseFlightInput()      pure
  │                                     └─ resolveFlight()         pure
  │                                          └─ routeRows (66,933)   server only
  │
  └─◄── ResolveResult: ranked candidates, each with a reason
         │
         ├─ user picks one, or corrects the form
         └─ useMutation(api.flights.add)  ──►  /api/flights/add ──►  routes/flights.ts
                                                  ├─ validates both airports exist
                                                  ├─ checks for a duplicate
                                                  └─ computes + stores distance,
                                                     duration and CO₂
  │
  └─ api.flights.list refetches, updating the map, list and stats together
```

Queries are the only read path. They share one cache, so a mutation invalidates
every mounted query at once and the map, the list and the stats all update
together — they cannot disagree about what is in the log. Nothing is duplicated
into client state.

## Decisions worth explaining

### One routing table, two runtimes

Every route is a function from a `Request` to a `Response` — the WHATWG
interfaces, which both target runtimes speak natively. `Bun.serve` adapts them
directly in development; in production `backend/server/node-adapter.ts` converts
Node's `IncomingMessage`/`ServerResponse` and calls the same function.

That adapter is the only file that knows a Node runtime exists. Adding an
Express dependency, or a second framework for the deployed case, would have
meant two implementations of every route and two things to keep in step. The
routing table itself is about twenty lines of paths, which is the smallest
amount of framework that can do the job.

It also lives in `backend/server/` rather than in `api/`, because Vercel builds
*every* file in `api/` as its own serverless function. A shared helper sitting
there is not a helper, it is a second function with no default export, and the
build fails on it. `api/` therefore contains exactly one file.

### The client has one base URL, and it is empty by default

`frontend/src/lib/api.ts` resolves every request against `apiBase`, which is
`VITE_API_URL` when it is set and `""` when it is not. An empty base means
"my own origin", which is right in two of the three arrangements this app runs
in: the Vite dev server proxies `/api` to the API process
(`frontend/vite.config.ts`), and a single Vercel deployment serves the static
frontend and the `api/[...path].ts` function together. The client is the same
code in both; nothing branches on where it is running.

The third arrangement is a real deployment with the frontend and the API on
different hosts, and that is how it is deployed now. It costs two variables
rather than a code change: `VITE_API_URL` on the frontend, read at build time,
and `ALLOWED_ORIGINS` on the API. `apiFetch` is the one place that knows which
case it is in — it sets `credentials: "include"` when the base is a different
origin from the page, and always stamps `x-skytrace-client`. The session cookie
follows the same signal, becoming `SameSite=None; Secure`: a `Lax` cookie is
never sent cross-site, so without that sign-in would appear to work and then
forget you on the next page.

That header is not decoration. An allowlist stops a hostile site *reading* the
log, but any site can send a request carrying the cookie; it cannot read the
reply. Requiring a header on writes forces a preflight that an HTML form post
cannot produce, so the allowlist stops a third party both ways. See
[environment-variables.md](environment-variables.md).

### Talking to Postgres over HTTP

`@neondatabase/serverless`'s `neon-http` driver speaks the Postgres protocol
over HTTP instead of holding a TCP socket open. That is what makes the API
deployable as a serverless function: there is no connection to keep alive, so
a function that wakes up after an hour idle costs nothing and does not time out
on a pooled connection. The same driver works against any Postgres, so a local
database and a managed one are the same code.

The client is built on first use rather than at import, so the process starts
and answers `/api/health` even with no `DATABASE_URL`. See
[environment-variables.md](environment-variables.md).

### The database half is tested without a database

`backend/scripts/check-api.ts` boots a Postgres inside the process (PGlite),
builds the schema by walking `db/schema.ts`, and drives the real route handlers
through the real HTTP entry point: sign-up, sign-in, sign-out, add, edit,
delete, bulk import, stats, trips, ownership, and the error cases.

It exists because the alternative was 600 lines of SQL and Drizzle queries that
nothing executed until a real `DATABASE_URL` appeared — which is exactly when
finding out that a foreign key or an enum was wrong is most expensive. It needs
no container, no connection string and no secrets, so it runs in CI.

The one seam the test needs is `setDbOverride` in `db/client.ts`, which points
the app at a different database. It is not configurable from the environment on
purpose: a mis-set variable must never be able to redirect where somebody's
flight log is read from.

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

### A provider is a value, not a dependency

`backend/server/flight-lookup/` is the only part of the app that talks to a
service it does not control, and it is shaped so that the second one is a new
file rather than a rewrite. `types.ts` holds the interface and the query
parsing, `amadeus.ts` is one implementation, and `index.ts` picks whichever is
configured. Nothing outside that directory knows a provider exists, and no
handler imports one directly.

Two properties are load-bearing rather than tidiness:

- **The credentials cannot reach the browser.** They are read from the
  environment inside a route handler, and the browser has no client for this at
  all — adding one would mean writing new code, because there is nothing in the
  bundle to repurpose.
- **It is optional in the strict sense.** With no key configured the resolver
  answers exactly as it always has, the UI renders no lookup control, and the
  endpoint answers `configured: false` rather than failing. A capability that
  changes the app's behaviour when its dependency is missing is not optional;
  this one changes nothing.

The provider is metered, so the route is behind sign-in — an anonymous endpoint
that spends somebody's quota is an open tab in front of a bill.

### Two entry points into `flight-core`

`flight-core` exports from two files, and the split is load-bearing.
`@skytrace/flight-core` is the browser-safe surface — formatters and geometry
only. `@skytrace/flight-core/server` adds the parser and the resolver, which
import `@skytrace/data` and its 2MB of airport and airline records.

A single barrel re-exporting everything meant that importing `formatDistance`
in a React component pulled the whole dataset into the client bundle. The
backend imports the `/server` entry point; nothing in `src/` does.

The map itself is a third, lazy chunk. deck.gl and MapLibre are 1.9MB between
them, so `FlightMap` is `React.lazy` everywhere it appears and the map vendor
chunk is fetched only when a map is actually rendered. Keeping it out of the
landing page's first paint took two things, not one:

- `LazyFlightMap` holds the import behind an `IntersectionObserver` *and* a
  `requestIdleCallback`, so the hero paints its headline, copy and calls to
  action first and the map swaps in afterwards over the SVG globe that was
  there anyway. `React.lazy` on its own is not enough in a hero: the section
  is guaranteed to be on screen, so the chunk would be requested while the
  browser was still trying to render the words.
- Nothing may reference the map chunk from `index.html`. `React.lazy` is a
  promise about the bundle, and a `modulepreload` or a stylesheet link breaks
  it silently. This was not hypothetical: Vite's dynamic-import helper was
  being folded into the map chunk, which made the entry chunk import 1.9MB
  statically and put a `modulepreload` for it in every page's HTML. CI asserts
  `index.html` is free of the map chunk, and MapLibre's stylesheet is imported
  by `FlightMap.tsx` rather than the entry point so it arrives with the map
  instead of in the one stylesheet every page loads.

### Derived values are snapshotted

Distance, duration and CO₂ are computed on write and stored. A log is history;
re-deriving a 2019 entry against changed data or a revised emissions model
would silently alter what the user remembers. See
[data-sources.md](data-sources.md#derived-values-and-why-they-are-snapshotted).

### Sign-up and sign-in stay separate

The sign-in handler reports a wrong password and an existing account the same
way. Falling back from sign-in to sign-up would turn "wrong password" into a
confusing "that account already exists", so the two flows are explicit and
errors are translated per flow. An email that does not exist is also
indistinguishable from a wrong password, and both take the same time, because
the handler hashes a password even when there is no such account.

### Seeing is free, saving is not

`/dashboard` is not behind a route guard. A visitor with no account gets the
map, drawn over a small sample log: the great-circle arcs, the colouring, the
playback and the basemap switcher all work, because looking at the product is
the part worth doing before asking for anything.

What needs an account is keeping a history — logging a flight, trips, stats,
import and export. `App.tsx` branches on `isAuthenticated` and renders
`GuestDashboard` or `DashboardPage`; the panels that would be empty without a
session are absent from the guest view rather than shown blank, so the page
never implies there is a log behind it.

The sample log lives in `frontend/src/lib/sampleFlights.ts` with its
coordinates written out by hand. Importing `@skytrace/data` for twelve rows
would put 1.2MB of airport records in the browser bundle, which is exactly what
the CI bundle assertion exists to prevent; the real geometry helpers are
imported instead, so the sample carries genuine distances and emissions.

Sign-in is asked for at the point of saving, via `signInHref`, which puts the
destination in the query string as `returnTo`. `/auth` navigates there
afterwards, so the user lands back where they were rather than on the landing
page.

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
| Backend | Bun / Node HTTP, no framework |
| Database | Postgres via Drizzle ORM |
| Hosting | Static frontend on Vercel, API on Render, [Neon](https://neon.tech) Postgres. `api/` can serve both from one origin instead |
| Auth | Sessions in an `HttpOnly` cookie, scrypt password hashing |
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
users            email, passwordHash, createdAt
                   unique index on lower(email)
sessions         tokenHash, userId, expiresAt, createdAt
flights          userId, airlineCode, airlineName, flightNumber, flightDate,
                 fromIata, toIata, distanceKm, durationMin, co2Kg,
                 aircraft, tailNumber, cabin, seat, costMinor, currency,
                 rating, notes, source, tripId, loggedAt
                   indexed by (userId) and (userId, flightDate)

trips            userId, name, startDate, endDate, createdAt
                   indexed by (userId)
```

`flightDate` is a real Postgres `date` column, which Postgres returns as
`yyyy-mm-dd` with no timezone attached, so it can never be shifted a day.
`costMinor` is integer minor units, so money never drifts. `tripId` references `trips` and `flights` references `trips` in the
other direction; the schema does not model the reverse link, so there is no
circular dependency to resolve.
