# Roadmap — what is done, and what is left

## Done

Ordered roughly as it was built. Each entry says what actually landed, not
what was attempted.

- [x] **Bun-workspaces monorepo** — `apps/web` plus `types`, `flight-core`,
      `data` and `ui` packages, with a shared `tsconfig.base.json`.
- [x] **Aviation reference data** — 6,072 airports, 6,162 airlines and 66,933
      routes generated from the OpenFlights public dataset, with route counts
      folded in as a hub/airline size signal. Regenerable with one script.
- [x] **Great-circle geometry** — haversine distance, on-sphere arc sampling,
      midpoint and interpolation helpers.
- [x] **CO₂ estimation** — cabin-class multipliers and a short-haul uplift.
- [x] **Free-text parser** — n-gram lookup against the real airport and airline
      vocabularies instead of hand-written patterns, so "Tokyo" and "London"
      resolve as readily as "NRT" and "LHR".
- [x] **Resolver with confidence tiers** — ranks candidates, attaches the reason
      for each, and reports what is still missing instead of guessing.
- [x] **Convex backend** — schema with `flights` and `trips`, Convex Auth on the
      password provider, queries for the log and the stats, and mutations with
      validation, ownership checks and duplicate detection.
- [x] **Landing page** — aviation night-sky theme, orthographic globe with real
      great-circle routes, and a live resolver demo that works signed out.
- [x] **Auth flow** — sign in and create account, with `returnTo` preserved
      across the redirect and `/dashboard` as the fallback destination.
- [x] **Dashboard** — stats tiles, per-year distance chart, most-flown airlines,
      searchable and filterable log, flight detail, and a map with selectable
      arcs.
- [x] **Add-flight flow** — resolve, disambiguate, review, save; with duplicate
      detection that offers rather than blocks.
- [x] **Free keyless basemaps** — OpenFreeMap (three styles), CARTO (two) and
      Esri satellite, switchable in-app with attribution rendered on the map.
- [x] **Monorepo-safe Convex codegen** — the backend bundles workspace packages
      and the 680KB route table correctly.
- [x] **Rating UI** — a 1–5 star control in the flight detail panel; clicking the
      current rating clears it.
- [x] **Bulk import** — one flight per line or a whole CSV, resolved and inserted
      in a single call, with a per-line result saying what was added, skipped as a
      duplicate, or could not be resolved.
- [x] **CSV export and import** — export from the header; import matches column
      names loosely, so most hand-rolled spreadsheets work without editing.
- [x] **Airport autocomplete** — server-side search over all 6,072 airports, wired
      into the from/to fields. The client still never holds the dataset.
- [x] **Trip grouping UI** — create a trip, assign flights to it on add or
      afterwards, and filter the list and the map by it. Deleting a trip
      detaches its flights rather than deleting them.
- [x] **Records panel** — longest and shortest flight, repeated routes, cost per
      km, spend by year and most-visited country, all clickable back into the log.
- [x] **Timeline playback** — play, pause and scrub the map through your flights
      in date order. Arcs after the cursor stay visible but dimmed, so the shape
      of the whole log is still legible while it animates.
- [x] **Map polish** — fly to the selected arc, reset the view, colour by cabin,
      distance or airline as well as year, and export the composited map as a PNG.
- [x] **Author and contact section** — who built it, what they work on, and how to
      reach them, from one config file.

## In progress

Nothing is half-built at the moment. The items below are the ones where the
design is settled and the work has not started.

## Left to do

Grouped by theme, most valuable first. The reasoning behind the ordering is in
the notes.

### Making the log worth having more of

- [ ] **Booking-confirmation email parsing** — paste the text of a confirmation
      email and get structured flights out. Needs an LLM provider; see
      [map-tiles.md](map-tiles.md) for how keyless-only choices are made
      elsewhere.
- [ ] **Boarding-pass photo (OCR)** — a phone camera in the add form.
- [ ] **Import that asks about low-confidence lines** — bulk import currently
      reports any line below `high` confidence rather than guessing, which is the
      safe behaviour. Letting the user pick a candidate per bad line, in bulk,
      would let an imperfect paste still land.
- [ ] **Undo an import** — one bad batch is easy to delete a row at a time, but
      not easy to undo a hundred. Would want the batch to record an import id.
- [ ] **Actual departure/arrival times and delay** — only meaningful with a
      flight API.

### Making the map worth looking at

- [ ] **Globe view** — the landing-page globe is already a correct orthographic
      projection with back-face culling; promoting it to a toggle is mostly
      wiring.
- [ ] **Animated arc drawing** — playback reveals whole flights one at a time.
      Drawing each arc along its own length is shader work and would look much
      better.
- [ ] **Country choropleth** — "countries I have been to" needs country
      polygons, which the current dataset does not carry.
- [ ] **Playback speed and per-flight captions** — the scrubber steps by distinct
      date. A speed control and a "March 2025 · SFO→JFK" caption would make it
      shareable as a short video.
- [ ] **Shareable playback link** — encode a date range in the URL so a
      particular window of the log can be sent to someone.

### Making the numbers mean something

- [ ] **Miles flown** and a rough award-travel value. `formatDistance` already
      takes a unit; the UI is metric-only and a per-user preference would be the
      honest way to add it.
- [ ] **Other superlatives** — most-visited airport, longest total route flown,
      most consecutive years travelling.
- [ ] **Red-eye count** — needs actual times, so this waits on the flight API.
- [ ] **Per-airline carbon comparison** — the emissions model is cabin-aware, but
      comparing carriers would need per-flight fuel burn rather than distance.

### Growing it

- [ ] **Follow other travellers** and overlay their maps. Depends on the public
      profile below.
- [ ] **Country and airport unlock checklists.**
- [ ] **Leaderboards** — farthest in 30 days, most airports in a year.

### Accounts and infrastructure

- [ ] **Google and GitHub sign-in** — small, but removes most sign-up friction.
- [ ] **Password reset** — needs an outbound email provider and a key.
- [ ] **Aviation API integration** — a Convex action that queries a provider for
      an exact flight and date, with the offline resolver as the fallback so the
      app degrades gracefully when no key is configured. This is also what would
      close the one remaining resolver gap: a flight number cannot be mapped to a
      route offline, because OpenFlights has routes but not schedules.
- [ ] **A test runner** — there are two runnable harnesses (`bun run check`,
      covering the resolver and the CSV layer) but no `bun test`, no CI, and
      `parse.ts` deserves real assertions before it gets more clever.
- [ ] **Import into the browser bundle** — the airport autocomplete runs on the
      server, which is correct, but it does mean a keystroke is a round trip.
      Worth revisiting only if it feels slow in practice; the alternative ships
      1.2MB to every visitor.
- [ ] **A real Convex cloud deployment** — see
      [getting-started.md](getting-started.md).

### The largest single piece of work left

- [ ] **A public flight-log profile for each user** — the growth loop.
      Everything above is more valuable per user; this is more valuable per
      cohort. It also needs a decision the current code deliberately avoids: a
      shareable page means a logged-out query over someone else's flights, which
      every function today refuses to serve on ownership grounds.
