# Free map tiles

Every basemap in Skytrace is **free, keyless and requires no signup**. That is
a hard requirement, not a preference: the map has to render for a stranger the
moment they open the page, and there is nowhere in this app to put an API key
that a user would have to obtain first.

The list lives in `frontend/src/lib/mapStyles.ts`. Each entry was checked to
return a real style document rather than a redirect to a sign-up page.

## Shipped

| Provider | Style | Endpoint | Notes |
| --- | --- | --- | --- |
| **OpenFreeMap** | Positron | `https://tiles.openfreemap.org/styles/positron` | Minimal greyscale. Open data, no key, no usage cap. |
| **OpenFreeMap** | Liberty | `https://tiles.openfreemap.org/styles/liberty` | OSM Classic styling on the same free tiles. |
| **OpenFreeMap** | Bright | `https://tiles.openfreemap.org/styles/bright` | Soft pastel; good for screenshots. |
| **CARTO** | Dark Matter | `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` | Near-black. The best backdrop for coloured arcs. |
| **CARTO** | Voyager | `https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json` | Warm and legible at low zoom. |
| **Esri World Imagery** | Satellite | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Raster, not a GL style. No key required. |

**OpenFreeMap is the default recommendation.** It is purpose-built for exactly
this case: OpenStreetMap data, no API key, no rate limit, no tracking. It is
the only one on this list with no usage cap attached.

## Also free, and why they are not wired in

Worth knowing about if the built-in set ever stops being enough.

| Provider | Free tier | Why not shipped |
| --- | --- | --- |
| **Protomaps** | Free for low traffic, self-hostable | Hosted tiles need a key; self-hosting is a build step we do not want to ship |
| **Esri World Topographic / Gray Canvas** | Keyless raster tiles | Raster only, and visually dated next to the vector styles above |
| **OpenTopoMap** | Free with a polite rate limit | Raster, strong rate limit, topographic focus |
| **Wikimedia maps** | Free, restricted to Wikimedia projects | Licence explicitly excludes third-party use |
| **Stadia Maps (Stamen)** | Free tier exists | Now requires an account and key |
| **MapTiler** | Free tier exists | Requires signup; the free tier is watermarked |
| **Mapbox** | Free tier exists | Requires signup, and ToS requires an attribution token |
| **Thunderforest** | Free for low volume | Requires signup |
| **OpenSeaMap** | Free, keyless | Marine charts only; would be a nice overlay, not a basemap |
| **NASA GIBS** | Free, keyless | Satellite imagery, coarse resolution, no labels |
| **Natural Earth / self-hosted tiles** | Public domain | Maximum control; requires generating vector tiles as a build step |

If you need a provider that does require a key, the honest place to put it is a
API route or an environment variable — not the browser bundle. That is the
same pattern the flight-API integration is designed around.

## Attribution

Every provider here requires visible credit. The app renders it directly on the
map rather than relying on MapLibre's default control, so it sits correctly on
a dark panel and cannot be missed.

If you add a provider, its `attribution` field is not optional.

## Adding a provider

1. Append an entry to `BASEMAPS` in `frontend/src/lib/mapStyles.ts` and add the
   id to the `BasemapId` union.
2. GL styles need a `styleUrl`. Raster sources need a `rasterUrl` with
   `{z}/{y}/{x}` or `{z}/{x}/{y}` placeholders — `toMapLibreStyle` wraps them in
   a minimal GL style automatically.
3. Set `tone` to whichever app theme the style reads well against. The arcs are
   drawn on top, so a near-black basemap makes the colours do the work.
4. Verify the endpoint returns a style document:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" "https://your.style/url"
   ```

5. Confirm the attribution text is what the provider's terms require. It is
   shown verbatim.
