# Capabilities

What the application does today, grouped by what a user is trying to achieve.
Status is honest: **Shipped** means it works in the running app, **Partial**
means it works but with a known limit, **Planned** means it is designed but not
built. See [roadmap.md](roadmap.md) for sequencing.

---

## 1. Finding the flight you half-remember

The core of the product. You type free text; it works out which flight you
meant.

| Capability | Status | Notes |
| --- | --- | --- |
| Free-text input | **Shipped** | "United to Tokyo in March 2025", "SFO to JFK" |
| Airline name → code | **Shipped** | "United" → UA, "Delta" → DL, via name ranking in the dataset |
| Airline alias resolution | **Shipped** | Full name or IATA/ICAO code |
| IATA / ICAO code recognition | **Shipped** | "UA 1234", "W2 555", "9W11" |
| City name → airport | **Shipped** | Any city or airport name, not just 3-letter codes |
| Ambiguous city disambiguation | **Shipped** | "London" resolves to LHR, not LCY — ranked by route volume |
| Partial dates | **Shipped** | "March 2025", "14 March", "3/14/2025", "2025-03-14" |
| Year inference | **Shipped** | A month/day with no year is placed in the past, never the future |
| Route-pair parsing | **Shipped** | "SFO to JFK", "SFO-JFK", "SFO → JFK" |
| Direction detection | **Shipped** | "from London" vs "to Tokyo" vs bare codes |
| Candidate ranking | **Shipped** | Both endpoints known → the route is certain |
| Airline-only suggestions | **Partial** | Offline it suggests the carrier's hub routes; with a flight provider configured it can check the real schedule |
| Live flight lookup | **Partial** | `GET /lookup/flight` against a real provider, server-side. The UI offers it only when a key is configured, so the app is unchanged without one |
| Confidence labelling | **Shipped** | Every candidate shows `exact` / `high` / `medium` and why |
| "Still needs" reporting | **Shipped** | Names the missing fields rather than guessing |
| Boarding-pass photo (OCR) | **Planned** | — |
| Booking-confirmation email import | **Planned** | Highest-value version of the above |
| Live flight status lookup | **Partial** | A provider lookup exists and is wired into the add-flight flow; it is off until an API key is set |

### Why "airline-only" is partial

Flight numbers are not in the OpenFlights dataset — it has routes, not
schedules. Given "UA 1234" with no airports we can offer the carrier's main
routes and ask, but we cannot say *which* one was flight 1234.

With `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` set, the add-flight flow
offers a live lookup that answers exactly that, and fills the form with the
route the provider reported. Without them the app behaves exactly as it always
has. See
[environment-variables.md](environment-variables.md#live-flight-data).

---

## 2. Logging a flight

| Capability | Status | Notes |
| --- | --- | --- |
| Add from a resolved candidate | **Shipped** | One click, details pre-filled and editable |
| Manual entry | **Shipped** | Codes, date, airline, number, cabin, seat, cost, notes |
| Duplicate detection | **Shipped** | Warns, then offers "log it anyway" — never blocks |
| Edit details after saving | **Shipped** | Seat, cabin, aircraft, cost, rating, notes, trip |
| Delete | **Shipped** | — |
| Seat and cabin class | **Shipped** | Cabin changes the carbon figure automatically |
| Cost tracking | **Shipped** | Stored in minor units to avoid float drift |
| Personal notes | **Shipped** | — |
| 1–5 star rating | **Shipped** | Set or cleared from the detail panel; clicking the current rating clears it |
| Trip grouping ("Japan 2025") | **Shipped** | Create, rename by editing, delete; assign on add or afterwards; filter the log, list and map by trip |
| Bulk paste (`UA123 2025-03-14` per line) | **Shipped** | One call for the whole batch, with a per-line result saying what happened |
| CSV export | **Shipped** | Whole log from the header, in the same column format the importer reads |
| CSV import | **Shipped** | Loose header matching, so most hand-rolled spreadsheets work unchanged |
| Airport autocomplete | **Shipped** | Server-side search over 6,072 airports; keyboard navigable |
| Aircraft type and tail number | **Partial** | Stored and editable, not auto-detected |
| Actual times and delays | **Planned** | — |
| Photos per flight | **Planned** | — |

---

## 3. The map

| Capability | Status | Notes |
| --- | --- | --- |
| Great-circle arcs | **Shipped** | Computed on the sphere, so polar routes bow correctly |
| Arcs lifted off the surface | **Shipped** | Prevents the basemap from hiding them |
| Arc coloured by year | **Shipped** | One hue per year of travel |
| Colour by cabin, distance or airline | **Shipped** | Switcher in the corner of the map |
| Click an arc to select | **Shipped** | Synced with the list and the detail panel |
| Hover highlight | **Shipped** | deck.gl `autoHighlight` |
| Airport markers | **Shipped** | Radius scales with how many flights you have made there |
| Airport labels | **Shipped** | Shown for airports you have visited more than once |
| Distance label on the selected arc | **Shipped** | Anchored at the great-circle midpoint |
| Pan and zoom | **Shipped** | Clicking an airport flies to it |
| Six free basemaps | **Shipped** | OpenFreeMap ×3, CARTO ×2, Esri satellite — all keyless |
| Basemap switcher | **Shipped** | With provider credit rendered on the map |
| Timeline playback by date | **Shipped** | Play, pause and scrub; arcs after the cursor stay visible but dimmed |
| Fly-to on selection | **Shipped** | Selecting in the list flies the camera to the arc midpoint |
| PNG export | **Shipped** | Basemap and overlay composited into one download |
| Reset view | **Shipped** | — |
| Globe view | **Planned** | The landing-page globe is a real orthographic projection and can be promoted |
| Animated arc drawing | **Planned** | Playback reveals whole flights; drawing them progressively is shader work |
| Country choropleth | **Planned** | Needs country polygons, not just airport points |

---

## 4. Statistics

| Capability | Status | Notes |
| --- | --- | --- |
| Flights, countries, airports, airlines | **Shipped** | Derived server-side, never duplicated in client state |
| Total distance | **Shipped** | Haversine on real coordinates |
| Total time aloft | **Shipped** | Estimated block time including taxi |
| Total and per-flight CO₂ | **Shipped** | Cabin-aware, with a short-haul correction |
| Distance by year | **Shipped** | Bar chart with per-year tooltips |
| Most-flown airlines | **Shipped** | — |
| Cost per kilometre | **Shipped** | Across priced flights, plus per-km and average-per-flight on each flight |
| Spend by year | **Shipped** | Mini bar chart in the records panel |
| Longest flight | **Shipped** | With route, date, distance and time; click to select it |
| Shortest flight | **Shipped** | Same treatment, hidden when it is the same flight as the longest |
| Route repeats | **Shipped** | Direction-independent, with first and last dates flown |
| Miles flown | **Partial** | `formatDistance` supports miles; the UI is metric-only |
| Most-visited country | **Shipped** | By number of arrivals |

---

## 5. Accounts

| Capability | Status | Notes |
| --- | --- | --- |
| Email and password sign-up / sign-in | **Shipped** | Sessions in an HttpOnly cookie, no email verification required to start |
| Session persistence | **Shipped** | — |
| Browse without an account | **Shipped** | The dashboard opens signed out over a sample log — the map, arcs, playback and colouring all work |
| Saving requires an account | **Shipped** | Sign-in is asked for at the point of saving, and `returnTo` puts you back where you were |
| Sign out | **Shipped** | — |
| Google / GitHub OAuth | **Planned** | Trivial to add; needs provider credentials |
| Password reset email | **Planned** | Needs an outbound email provider |
| Public flight-log profile | **Planned** | The growth loop; see roadmap |

---

## 6. Data and engineering

| Capability | Status | Notes |
| --- | --- | --- |
| Monorepo with shared packages | **Shipped** | Bun workspaces, four shared packages |
| 6,072 airports indexed | **Shipped** | Regenerable from source |
| 6,162 airlines indexed | **Shipped** | — |
| 66,933 routes indexed | **Shipped** | Backend-only; kept out of the browser bundle |
| Resolver test harness | **Shipped** | `bun run check:resolver` |
| CSV import/export checks | **Shipped** | `bun run check:csv` — 34 assertions over dates, header mapping and round-tripping |
| CI on every push and PR | **Shipped** | Typecheck, both harnesses, a production build, and an assertion that the airport dataset never reached the client bundle |
| Unit tests | **Partial** | Two assertion harnesses in CI plus a resolver harness you read by eye; no test runner (`bun test`) yet |
| API tested against a real Postgres | **Shipped** | `bun run check:api` drives the real routes in-process, 217 assertions |
| Schema applied on boot | **Shipped** | `start` runs `db:push` first, so a deploy has no release step |
| Demo data on boot | **Shipped** | `start` seeds a demo account with real derived figures, when `SEED_DEMO_PASSWORD` is set; idempotent, never touches a real log |
| Split deployment | **Shipped** | Frontend, API and database on three hosts; two environment variables |
| Offline resolver | **Shipped** | Needs no third-party API to function |
| Aviation API hook | **Shipped** | One provider behind an interface, server-side, off without a key; a second is a new file |
| Live flight lookup | **Partial** | Real schedules for a flight number, filling the form; no status polling, no tracking |
| Snapshot semantics for saved flights | **Shipped** | Distance/duration/CO₂ are stored, not re-derived |

---

## 7. Appearance

| Capability | Status | Notes |
| --- | --- | --- |
| Light and dark themes | **Shipped** | One stylesheet, not two — the palette is CSS custom properties swapped at runtime, so every colour with an alpha modifier follows for free |
| Theme toggle | **Shipped** | In all three headers; the choice is stored and applied before first paint, so there is no flash of the wrong theme |
| Light/dark over a runtime switch | **Shipped** | The dark palette inverts the accent scale rather than dimming the light one, because the prominent end of each scale has to stay prominent |
| WCAG AA contrast | **Shipped** | Both palettes checked against every surface they are used on |
| Reduced-motion support | **Shipped** | Honours `prefers-reduced-motion` in the stylesheet and in the globe's own rotation |

## 8. Who built it

| Capability | Status | Notes |
| --- | --- | --- |
| Author and contact section | **Shipped** | On the landing page, with a compact credit in the footer and on the auth page |
| All contact details in one place | **Shipped** | `frontend/src/lib/site.ts`; nothing is hardcoded in a component |

Built by **Madhur Gupta** — Full Stack Developer at Qen Labs, working on
geospatial and realtime systems. See the [About section](https://github.com/Madhurg2002)
on the landing page, or [github.com/Madhurg2002](https://github.com/Madhurg2002).
