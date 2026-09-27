# Data sources

## Aviation data: OpenFlights

Everything the app knows about airports, airlines and routes comes from the
[OpenFlights](https://github.com/jpatokal/openflights) public dataset:

- `airports.dat` — 7,698 airports
- `airlines.dat` — 6,162 carriers
- `routes.dat` — 67,663 airline routes

The raw files live in `packages/data/raw/` and are compiled to TypeScript by
`packages/data/scripts/build-data.ts`.

### Licensing

OpenFlights publishes the data under the **Open Database License (ODbL)**, with
the underlying airport and route data derived from OpenStreetMap (ODbL) and
various government and commercial sources. Attribution is required, and the
landing page footer credits the dataset. If the project grows commercially,
re-read the ODbL share-alike terms before shipping.

### What gets kept, and what gets thrown away

The generator keeps only the fields the app uses and drops the rest:

| Kept | Dropped |
| --- | --- |
| IATA, ICAO, name, city, country | Airline IDs, equipment types, stop counts |
| Latitude, longitude | Timezone — OpenFlights stores a numeric offset, not a zone |
| Elevation | The `dst` flag (British Summer Time etc.) |
| Route airline, origin, destination | Airline and airport numeric IDs |

Airports without an IATA code are dropped entirely, because IATA is the key
everything else joins on. That takes 7,698 rows down to 6,072.

Routes are filtered to those where both endpoints survive that cut, giving
66,933 usable routes.

### Route counts are a size signal, not a frequency

Each route's `count` is the number of times it appears in `routes.dat`,
**including codeshare rows** that are not emitted as routes of their own. That
is a rough popularity measure and nothing more — it is not a real flight
frequency. It exists because there is no size column anywhere in the dataset,
and something is needed to answer "which of these airports did they mean?".

It does double duty:

- **Airport hubs.** "London" is five airports and "New York" includes two
  heliports. Ranking a name bucket by route count puts LHR first and filters
  out the strips nobody connects through.
- **Airline prominence.** Without it, "United" resolves to United Airways and
  "Delta" to Delta Aerotaxi, because those names also start with the word the
  user typed. Route count picks United Airlines and Delta Air Lines.

### Regenerating

```bash
bun run data:build
```

Writes `packages/data/src/airports.generated.ts`,
`airlines.generated.ts` and `routes.generated.ts`. The files carry a header
saying they are generated; do not edit them by hand.

To pick up a newer upstream release, replace the three files in
`packages/data/raw/` and re-run the script. The header comment is the only
thing that needs updating.

### The route table never reaches the browser

`routes.generated.ts` is about 680KB. It is imported by exactly one Convex
function, `convex/resolve.ts`, and is deliberately **not** re-exported from
`packages/data/src/index.ts`. Importing the package entry point therefore
cannot pull it into the browser bundle, which is why the airports and airlines
can be shared freely.

The packed representation — one string of `AIRLINE|SRC|DEST:COUNT` records —
is a build-time choice. The same data as an array of objects was 2.7MB.

## Basemap tiles

Separate from the aviation data, and covered in [map-tiles.md](map-tiles.md).

## Derived values, and why they are snapshotted

Distance, duration and CO₂ are **computed once at save time and stored on the
flight record**. They are never re-derived at read time.

This is the single most important data decision in the app. A flight log is
history. If a 2019 entry were re-computed against a dataset that has since
changed, or against an emissions model that has been revised, the map would
quietly show a different distance than the one the user remembers. Snapping the
values at write time means a log entry stays true to itself forever.

The consequence is that changing the geometry or emissions code only affects
newly logged flights. That is the correct trade — see the `add` mutation in
`apps/web/convex/flights.ts`, which calls the shared helpers server-side and
writes the result.

## Anything we could not get for free

- **Flight numbers → routes.** OpenFlights has no schedule data, so a flight
  number cannot be resolved to a route offline. See
  [capabilities.md](capabilities.md#1-finding-the-flight-you-half-remember).
- **Airport size.** No dataset column exists; route count is the proxy.
- **Country polygons.** Needed for a choropleth. Not currently shipped.
- **Actual times and delays.** Requires a real-time flight API.
