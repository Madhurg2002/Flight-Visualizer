import { ArcLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import { FlyToInterpolator, type PickingInfo } from "@deck.gl/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Aliased: a bare `Map` import would shadow the global `Map` constructor used
// for the airport lookup below.
import { Map as MapLibreMap } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { FlightLogWithAirports } from "@skytrace/types";
import { cn } from "@skytrace/ui";
// MapLibre's stylesheet belongs to this chunk, not to the app. Imported in the
// entry point it lands in the one stylesheet every page loads — including the
// marketing pages, which have no map until long after first paint. The build
// emits it alongside this chunk, so it arrives with the map and not before.
import "maplibre-gl/dist/maplibre-gl.css";
import { formatDate, formatDistance, interpolate } from "@skytrace/flight-core";
import { Camera, Download, Pause, Play, RotateCcw } from "lucide-react";
import { getBasemap, toMapLibreStyle, type BasemapId } from "../lib/mapStyles";

export type { BasemapId };

/** How the arcs are coloured. Year is the default because it reads as history. */
export type ColorMode = "year" | "cabin" | "distance" | "airline";

export const COLOR_MODES: { id: ColorMode; label: string }[] = [
  { id: "year", label: "Year" },
  { id: "cabin", label: "Cabin" },
  { id: "distance", label: "Distance" },
  { id: "airline", label: "Airline" },
];

export type ArcDatum = {
  id: string;
  from: [number, number];
  to: [number, number];
  color: [number, number, number, number];
  label: string;
  distanceKm: number;
  date: string;
};

type AirportDatum = {
  iata: string;
  position: [number, number];
  count: number;
  name: string;
};

type Palette = [number, number, number][];

/**
 * deck.gl animates a view change when it carries a transition, so the type of
 * the view state includes the transition fields even though the resting state
 * does not use them.
 */
type AnimatedViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
  transitionInterpolator?: FlyToInterpolator;
};

const SIGNAL: Palette = [
  [245, 165, 36], // signal amber
  [45, 212, 191], // teal
  [148, 163, 184], // haze
  [251, 191, 36], // warm yellow
  [96, 165, 250], // sky
  [244, 114, 182], // rose
  [163, 230, 53], // lime
  [251, 146, 60], // orange
];

/** Short-haul through to ultra-long-haul, as a heat ramp. */
const DISTANCE: Palette = [
  [45, 212, 191],
  [96, 165, 250],
  [167, 139, 250],
  [244, 114, 182],
  [245, 165, 36],
];

const CABIN: Palette = [
  [148, 163, 184], // economy
  [45, 212, 191], // premium economy
  [96, 165, 250], // business
  [251, 191, 36], // first
];

/** Bucket a distance into the ramp above, so colour means something legible. */
function distanceBucket(km: number): number {
  if (km < 1500) return 0;
  if (km < 4000) return 1;
  if (km < 8000) return 2;
  if (km < 12000) return 3;
  return 4;
}

function pick(palette: Palette, index: number): [number, number, number, number] {
  const [r, g, b] = palette[index % palette.length]!;
  return [r, g, b, 210];
}

export function FlightMap({
  flights,
  selectedId,
  onSelect,
  basemap = "carto-dark",
  colorMode = "year",
  onColorModeChange,
  className,
}: {
  flights: FlightLogWithAirports[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  basemap?: BasemapId;
  colorMode?: ColorMode;
  onColorModeChange?: (mode: ColorMode) => void;
  className?: string;
}) {
  const mapRef = useRef<MapRef>(null);
  const deckRef = useRef<{
    deck?: { canvas?: HTMLCanvasElement; redraw: (force?: boolean) => void };
  }>(null);

  const [viewState, setViewState] = useState<AnimatedViewState>({
    longitude: 0,
    latitude: 22,
    zoom: 1.1,
    pitch: 0,
    bearing: 0,
  });

  // -------------------------------------------------------------- playback
  // Playback is a date cursor: every flight on or before it is drawn, the rest
  // are not. Storing a date rather than an index means the scrubber maps to
  // real days, not to an arbitrary order of rows.
  const [cursor, setCursor] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const dates = useMemo(
    () => [...new Set(flights.map((f) => f.flightDate))].sort(),
    [flights],
  );

  // Anything that changes what is on screen stops playback, so the map never
  // plays an animation of a log the user has since edited.
  useEffect(() => {
    setPlaying(false);
  }, [flights, colorMode]);

  // Keep the cursor in range as the log grows or shrinks.
  useEffect(() => {
    if (dates.length === 0) {
      setCursor(null);
      return;
    }
    setCursor((current) => {
      if (current === null) return dates[dates.length - 1]!;
      return dates.includes(current) ? current : dates[dates.length - 1]!;
    });
  }, [dates]);

  const cursorIndex = cursor === null ? dates.length : dates.indexOf(cursor) + 1;
  const atEnd = cursorIndex >= dates.length;

  // Step through the distinct dates. An interval rather than a rAF loop,
  // because there is nothing to interpolate — the arcs simply appear.
  useEffect(() => {
    if (!playing || dates.length < 2) return;
    const timer = setInterval(() => {
      setCursor((current) => {
        const index = current === null ? dates.length : dates.indexOf(current);
        return index >= dates.length - 1 ? dates[0]! : dates[index + 1]!;
      });
    }, 700);
    return () => clearInterval(timer);
  }, [playing, dates]);

  const visible = useMemo(
    () => (cursor === null ? flights : flights.filter((f) => f.flightDate <= cursor)),
    [flights, cursor],
  );
  const shownCount = visible.length;

  // --------------------------------------------------------------- colours
  const arcs = useMemo<ArcDatum[]>(() => {
    const years = [...new Set(flights.map((f) => f.flightDate.slice(0, 4)))].sort();
    const airlines = [
      ...new Set(flights.map((f) => f.airlineCode ?? "?")),
    ].sort();

    return flights.map((flight) => {
      let color: [number, number, number, number];
      switch (colorMode) {
        case "cabin": {
          const order = ["economy", "premium_economy", "business", "first"];
          color = pick(CABIN, order.indexOf(flight.cabin ?? "economy"));
          break;
        }
        case "distance":
          color = pick(DISTANCE, distanceBucket(flight.distanceKm));
          break;
        case "airline":
          color = pick(SIGNAL, airlines.indexOf(flight.airlineCode ?? "?"));
          break;
        default:
          color = pick(SIGNAL, years.indexOf(flight.flightDate.slice(0, 4)));
      }

      // Flights after the playback cursor stay on the map but drop back, so the
      // shape of the whole log is still legible while it animates in.
      const future = cursor !== null && flight.flightDate > cursor;

      return {
        id: flight.id,
        from: [flight.fromLon, flight.fromLat] as [number, number],
        to: [flight.toLon, flight.toLat] as [number, number],
        color: [color[0], color[1], color[2], future ? 32 : color[3]],
        label: `${flight.fromIata} → ${flight.toIata}`,
        distanceKm: flight.distanceKm,
        date: flight.flightDate,
      };
    });
  }, [flights, colorMode, cursor]);

  const airports = useMemo(() => {
    const byIata = new Map<string, AirportDatum>();
    for (const flight of visible) {
      for (const [iata, lat, lon, name] of [
        [flight.fromIata, flight.fromLat, flight.fromLon, flight.fromCity],
        [flight.toIata, flight.toLat, flight.toLon, flight.toCity],
      ] as const) {
        const existing = byIata.get(iata);
        if (existing) existing.count += 1;
        else byIata.set(iata, { iata, position: [lon, lat], count: 1, name });
      }
    }
    return [...byIata.values()];
  }, [visible]);

  // ------------------------------------------------------------ fly to arc
  // Selecting a flight in the list should move the map, otherwise the panel
  // and the map can disagree about what you are looking at.
  useEffect(() => {
    const arc = arcs.find((a) => a.id === selectedId);
    if (!arc) return;
    const mid = interpolate(
      { lat: arc.from[1], lon: arc.from[0] },
      { lat: arc.to[1], lon: arc.to[0] },
      0.5,
    );
    setViewState((current) => ({
      ...current,
      longitude: mid.lon,
      latitude: mid.lat,
      zoom: Math.max(current.zoom, 3),
      // The duration and easing are what make it read as motion rather than a
      // jump cut.
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, [arcs, selectedId]);

  // ---------------------------------------------------------------- layers
  const layers = useMemo(() => {
    const selected = arcs.find((a) => a.id === selectedId);

    // ArcLayer interpolates along the great circle by itself, so the arcs bow
    // over the poles the way the real route does.
    const arcLayer = new ArcLayer({
      id: "flight-arcs",
      data: arcs,
      getSourcePosition: (d: ArcDatum) => d.from,
      getTargetPosition: (d: ArcDatum) => d.to,
      getSourceColor: (d: ArcDatum) => d.color,
      getTargetColor: (d: ArcDatum) => d.color,
      getWidth: (d: ArcDatum) => (d.id === selectedId ? 4 : 1.6),
      numSegments: 64,
      widthMinPixels: 1,
      widthMaxPixels: 6,
      // Lift the arc off the surface so the basemap does not hide it.
      altitude: 0.06,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 90],
      onClick: (info: PickingInfo<ArcDatum>) => onSelect(info.object?.id ?? null),
      updateTriggers: {
        getWidth: selectedId,
        getSourceColor: [cursor, colorMode],
        getTargetColor: [cursor, colorMode],
      },
    });

    const airportLayer = new ScatterplotLayer<AirportDatum>({
      id: "airport-dots",
      data: airports,
      getPosition: (d: AirportDatum) => d.position,
      getRadius: (d: AirportDatum) => 2200 + d.count * 900,
      getFillColor: [205, 214, 231, 210],
      stroked: true,
      getLineColor: [11, 18, 32, 255],
      getLineWidth: 60,
      lineWidthMinPixels: 1,
      radiusMinPixels: 2.5,
      pickable: true,
      onClick: (info: PickingInfo<AirportDatum>) => {
        const item = info.object;
        if (!item) return;
        setViewState((v) => ({
          ...v,
          longitude: item.position[0],
          latitude: item.position[1],
          zoom: 5,
          transitionDuration: 700,
          transitionInterpolator: new FlyToInterpolator(),
        }));
      },
    });

    const labelLayer = new TextLayer<AirportDatum>({
      id: "airport-labels",
      data: airports.filter((a) => a.count > 1),
      getPosition: (d: AirportDatum) => d.position,
      getText: (d: AirportDatum) => d.iata,
      getSize: 11,
      getColor: [205, 214, 231, 220],
      getPixelOffset: [0, 10],
      getTextAnchor: "middle",
      fontFamily: "ui-monospace, monospace",
      fontWeight: 600,
      billboard: true,
      pickable: false,
    });

    // A single distance label, anchored at the midpoint of the selected arc.
    const selectedLabelLayer = new TextLayer<ArcDatum>({
      id: "selected-arc-label",
      data: selected ? [selected] : [],
      getPosition: (d: ArcDatum) => {
        const mid = interpolate(
          { lat: d.from[1], lon: d.from[0] },
          { lat: d.to[1], lon: d.to[0] },
          0.5,
        );
        return [mid.lon, mid.lat];
      },
      getText: (d: ArcDatum) => formatDistance(d.distanceKm),
      getSize: 12,
      getColor: [252, 211, 77, 255],
      getBackgroundColor: [11, 18, 32, 220],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      background: true,
      backgroundPadding: [6, 3],
      fontFamily: "ui-monospace, monospace",
      fontWeight: 600,
      billboard: true,
    });

    return [arcLayer, airportLayer, labelLayer, selectedLabelLayer];
  }, [arcs, airports, onSelect, selectedId, cursor, colorMode]);

  // ------------------------------------------------------------ png export
  // Two canvases have to be composited: the basemap below and the deck overlay
  // above. The basemap keeps its buffer via `canvasContextAttributes`; the
  // deck overlay is forced to redraw and then read in the same task, before
  // the browser is allowed to discard the frame.
  const exportPng = useCallback(() => {
    const base = mapRef.current?.getCanvas();
    if (!base) return;

    const deck = deckRef.current?.deck;
    deck?.redraw(true);
    const overlay = deck?.canvas;

    const canvas = document.createElement("canvas");
    canvas.width = base.width;
    canvas.height = base.height;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(base, 0, 0, canvas.width, canvas.height);
    if (overlay) context.drawImage(overlay, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `skytrace-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }, []);

  function resetView() {
    setViewState({
      longitude: 0,
      latitude: 22,
      zoom: 1.1,
      pitch: 0,
      bearing: 0,
      transitionDuration: 800,
      transitionInterpolator: new FlyToInterpolator(),
    });
  }

  const colourLabel =
    COLOR_MODES.find((mode) => mode.id === colorMode)?.label ?? "Year";

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-paper-50", className)}>
      <DeckGL
        ref={deckRef as never}
        viewState={viewState}
        onViewStateChange={({ viewState: next }) =>
          setViewState(next as unknown as typeof viewState)
        }
        controller={true}
        layers={layers}
        onClick={(info: PickingInfo) => {
          // Clicking empty water clears the selection.
          if (!info.layer) onSelect(null);
        }}
      >
        <MapLibreMap
          ref={mapRef}
          mapStyle={toMapLibreStyle(getBasemap(basemap))}
          reuseMaps
          attributionControl={false}
          // Required so the basemap is still readable at the moment the PNG is
          // composited, rather than cleared after the last paint.
          canvasContextAttributes={{ preserveDrawingBuffer: true }}
        />
        <Attribution text={getBasemap(basemap).attribution} />
      </DeckGL>

      {/* ----------------------------------------------------- playback bar */}
      {dates.length > 0 && (
        <div className="absolute inset-x-2 bottom-7 z-10 flex items-center gap-2.5 rounded-xl border border-paper-300 bg-paper-100/90 px-2.5 py-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              if (atEnd) setCursor(dates[0]!);
              setPlaying((value) => !value);
            }}
            aria-label={playing ? "Pause playback" : "Play your flights in date order"}
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-chart-600/15 text-chart-600 transition-colors hover:bg-chart-600/25"
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(0, dates.length - 1)}
            value={Math.max(0, cursorIndex - 1)}
            onChange={(event) => {
              setPlaying(false);
              setCursor(dates[Number(event.target.value)] ?? null);
            }}
            aria-label="Scrub through your flights by date"
            // The element itself is 24px tall so it can actually be grabbed;
            // the hairline you see is the track inside it, drawn by the
            // `.scrubber` rules in index.css.
            className="scrubber min-w-0 flex-1"
          />

          <span className="tabular w-28 shrink-0 text-right text-[10px] text-ink-400">
            {shownCount}/{flights.length} · {cursor ? formatDate(cursor) : "all"}
          </span>
        </div>
      )}

      {/* ------------------------------------------------- corner controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5">
        {onColorModeChange && (
          <div className="flex items-center gap-0.5 rounded-lg border border-paper-300 bg-paper-100/90 p-0.5 backdrop-blur">
            {COLOR_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onColorModeChange(mode.id)}
                title={`Colour arcs by ${mode.label.toLowerCase()}`}
                className={cn(
                  // 10px type with py-1 lands at 23px, a shade under the 24px
                  // WCAG 2.5.8 minimum target size. py-1.5 takes the hit area
                  // over the line without changing the type size.
                  "rounded-md px-2 py-1.5 text-[10px] transition-colors",
                  mode.id === colorMode
                    ? "bg-chart-600/15 text-chart-600"
                    : "text-ink-400 hover:text-ink-600",
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset the view"
            title="Reset the view"
            className="grid size-7 place-items-center rounded-lg border border-paper-300 bg-paper-100/90 text-ink-600 backdrop-blur transition-colors hover:border-paper-400"
          >
            <Camera className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={exportPng}
            aria-label="Download this map as a PNG"
            title="Download as PNG"
            className="grid size-7 place-items-center rounded-lg border border-paper-300 bg-paper-100/90 text-ink-600 backdrop-blur transition-colors hover:border-paper-400"
          >
            <Download className="size-3.5" />
          </button>
        </div>
      </div>

      <p className="tabular pointer-events-none absolute bottom-2 left-2 rounded-md border border-paper-300 bg-paper-100/85 px-2 py-1 text-[10px] text-ink-400">
        Colour = {colourLabel.toLowerCase()}
        {dates.length > 0 && shownCount < flights.length && (
          <span className="ml-1 text-chart-600">
            · showing {shownCount} of {flights.length}
          </span>
        )}
      </p>

      {!atEnd && (
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setCursor(dates[dates.length - 1]!);
          }}
          className="absolute right-2 bottom-[4.4rem] z-10 flex items-center gap-1 rounded-lg border border-paper-300 bg-paper-100/90 px-2 py-1 text-[10px] text-ink-500 backdrop-blur transition-colors hover:border-paper-400 hover:text-ink-700"
        >
          <RotateCcw className="size-3" />
          Show all
        </button>
      )}

      <Attribution text={getBasemap(basemap).attribution} />
    </div>
  );
}

/**
 * Every one of these providers requires visible credit, and the default
 * MapLibre control does not sit well on a dark panel — so it is rendered here
 * in the app's own styling instead of being switched off.
 */
function Attribution({ text }: { text: string }) {
  return (
    <p className="pointer-events-none absolute right-2 bottom-1.5 rounded bg-paper-50/70 px-1.5 py-0.5 text-[9px] text-ink-400 select-none">
      {text}
    </p>
  );
}
