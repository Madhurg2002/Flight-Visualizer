/**
 * Free, keyless basemap providers.
 *
 * Every entry here was chosen for one property: no API key, no signup, and no
 * per-request billing. That is a hard requirement for this app — the map has
 * to render the moment somebody opens the page, for a stranger, with nothing
 * configured. It also means we cannot ship a style that quietly rate-limits
 * and leaves the map grey, so each was checked to return a real style
 * document.
 *
 * Attribution requirements are recorded per entry and rendered on the map.
 * Dropping a provider means dropping the entry, not just hiding it.
 */

import type { StyleSpecification } from "maplibre-gl";

export type BasemapId =
  | "openfreemap-positron"
  | "openfreemap-liberty"
  | "openfreemap-bright"
  | "carto-dark"
  | "carto-voyager"
  | "esri-satellite";

export type Basemap = {
  id: BasemapId;
  label: string;
  provider: string;
  /** GL style JSON URL, or `undefined` for a raster source. */
  styleUrl?: string;
  /** Raster tile template, used when there is no vector style. */
  rasterUrl?: string;
  attribution: string;
  /** Which app theme this basemap is designed to sit on. */
  tone: "dark" | "light";
  note: string;
};

export const BASEMAPS: readonly Basemap[] = [
  {
    id: "carto-dark",
    label: "Dark matter",
    provider: "CARTO",
    styleUrl: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    attribution: "© OpenStreetMap contributors © CARTO",
    tone: "dark",
    note: "Near-black basemap. The best backdrop for coloured flight arcs.",
  },
  {
    id: "openfreemap-positron",
    label: "Positron",
    provider: "OpenFreeMap",
    styleUrl: "https://tiles.openfreemap.org/styles/positron",
    attribution: "© OpenStreetMap contributors, © OpenFreeMap",
    tone: "light",
    note: "Minimal greyscale. Open data, no key, no usage cap.",
  },
  {
    id: "openfreemap-liberty",
    label: "Liberty",
    provider: "OpenFreeMap",
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    attribution: "© OpenStreetMap contributors, © OpenFreeMap",
    tone: "light",
    note: "OSM Classic styling on OpenFreeMap's free tiles.",
  },
  {
    id: "openfreemap-bright",
    label: "Bright",
    provider: "OpenFreeMap",
    styleUrl: "https://tiles.openfreemap.org/styles/bright",
    attribution: "© OpenStreetMap contributors, © OpenFreeMap",
    tone: "light",
    note: "Soft pastel basemap, good for screenshots.",
  },
  {
    id: "carto-voyager",
    label: "Voyager",
    provider: "CARTO",
    styleUrl: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    attribution: "© OpenStreetMap contributors © CARTO",
    tone: "light",
    note: "Warm and legible at low zoom; busier than Positron.",
  },
  {
    id: "esri-satellite",
    label: "Satellite",
    provider: "Esri World Imagery",
    rasterUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    tone: "dark",
    note: "Raster imagery, no key required. Attribution is mandatory.",
  },
];

const byId = new Map(BASEMAPS.map((b) => [b.id, b]));

export function getBasemap(id: BasemapId): Basemap {
  return byId.get(id) ?? BASEMAPS[0]!;
}

/** Styles MapLibre understands, ready for the `<Map mapStyle>` prop. */
export function toMapLibreStyle(basemap: Basemap): string | StyleSpecification {
  if (basemap.styleUrl) return basemap.styleUrl;
  return {
    version: 8,
    sources: {
      imagery: {
        type: "raster",
        tiles: [basemap.rasterUrl!],
        tileSize: 256,
        attribution: basemap.attribution,
      },
    },
    layers: [{ id: "imagery", type: "raster", source: "imagery" }],
  };
}
