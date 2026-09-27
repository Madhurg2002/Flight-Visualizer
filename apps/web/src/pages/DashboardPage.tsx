import { useQuery } from "convex/react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, cn } from "@skytrace/ui";
import { Download, Layers, LogOut, Plane } from "lucide-react";
import { AddFlightPanel } from "../components/AddFlightPanel";
import { BulkImportPanel } from "../components/BulkImportPanel";
import { FlightDetail, FlightList } from "../components/FlightList";
import type { BasemapId, ColorMode } from "../components/FlightMap";
import { RecordsPanel } from "../components/RecordsPanel";
import { StatTiles, TopAirlines } from "../components/StatTiles";
import { TripPanel } from "../components/TripPanel";
import { Spinner } from "../lib/spinner";
import { api } from "@convex/_generated/api";
import { useSignOut } from "../lib/auth";
import { BASEMAPS, getBasemap } from "../lib/mapStyles";
import { downloadTextFile, flightsToCsv } from "../lib/csv";

/**
 * deck.gl and MapLibre are ~1.9MB together and only the dashboard renders a
 * map — the landing page uses a hand-drawn SVG globe. Loading it on demand
 * keeps that weight off the marketing page entirely.
 */
const FlightMap = lazy(() =>
  import("../components/FlightMap").then((m) => ({ default: m.FlightMap })),
);

export function DashboardPage() {
  const flights = useQuery(api.flights.list, {});
  const stats = useQuery(api.flights.stats, {});
  const trips = useQuery(api.trips.list, {});
  const email = useQuery(api.users.me, {});
  const signOut = useSignOut();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>("carto-dark");
  const [colorMode, setColorMode] = useState<ColorMode>("year");
  // Trip filter. Kept here rather than inside the list so the map and the
  // export can narrow by the same thing.
  const [tripFilter, setTripFilter] = useState<string | null>(null);

  const all = useMemo(() => flights ?? [], [flights]);
  const tripList = useMemo(() => trips ?? [], [trips]);

  const list = useMemo(
    () => (tripFilter ? all.filter((f) => f.tripId === tripFilter) : all),
    [all, tripFilter],
  );

  const selected = useMemo(
    () => all.find((f) => f.id === selectedId) ?? null,
    [all, selectedId],
  );

  if (flights === undefined || trips === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <Spinner />
      </div>
    );
  }

  const activeTrip = tripList.find((trip) => trip.id === tripFilter) ?? null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink-800 px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg border border-signal-400/40 bg-signal-400/10">
            <Plane className="size-3.5 -rotate-45 text-signal-400" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Skytrace</span>
          {email && <span className="text-xs text-haze-600">{email}</span>}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              downloadTextFile(
                `skytrace-${new Date().toISOString().slice(0, 10)}.csv`,
                flightsToCsv(all),
              )
            }
            disabled={all.length === 0}
            title="Export your whole log as CSV"
          >
            <Download />
            Export
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Public site</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <div className="grid shrink-0 gap-2.5 p-2.5 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <StatTiles stats={stats ?? null} />
        </div>
        <div className="hidden space-y-2.5 lg:block">
          <TopAirlines stats={stats ?? null} />
          <RecordsPanel stats={stats ?? null} onSelect={setSelectedId} />
        </div>
      </div>

      <main className="grid min-h-0 flex-1 gap-2.5 px-2.5 pb-2.5 lg:grid-cols-[320px_1fr_320px]">
        <aside className="min-h-0 space-y-2.5 overflow-y-auto">
          <AddFlightPanel onAdded={() => setSelectedId(null)} trips={tripList} />
          <BulkImportPanel
            flights={all}
            trips={tripList}
            onImported={() => setSelectedId(null)}
          />
          <TripPanel activeTripId={tripFilter} onFilterChange={setTripFilter} />
        </aside>

        <section className="panel relative min-h-[320px] overflow-hidden">
          {list.length > 0 ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-6" />
                </div>
              }
            >
              <FlightMap
                flights={list}
                selectedId={selectedId}
                onSelect={setSelectedId}
                basemap={basemap}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
              />
            </Suspense>
          ) : (
            <EmptyMapState
              filtered={all.length > 0}
              onClearFilter={() => setTripFilter(null)}
            />
          )}
          <BasemapPicker value={basemap} onChange={setBasemap} />
        </section>

        <aside
          className={cn(
            "min-h-0 space-y-2.5 overflow-y-auto",
            selected && "hidden lg:block",
          )}
        >
          {selected && (
            <FlightDetail flight={selected} trips={tripList} />
          )}
          <div className="panel h-full min-h-[300px] p-3 lg:h-auto">
            {activeTrip && (
              <p className="mb-2 flex items-center justify-between rounded-md bg-signal-400/10 px-2 py-1 text-[11px] text-signal-300">
                <span className="truncate">{activeTrip.name}</span>
                <button
                  type="button"
                  onClick={() => setTripFilter(null)}
                  className="ml-2 shrink-0 text-haze-500 transition-colors hover:text-haze-300"
                >
                  Clear
                </button>
              </p>
            )}
            <FlightList flights={list} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </aside>
      </main>
    </div>
  );
}

/**
 * Basemap switcher. Every option is free and keyless, so the choice is purely
 * about what reads best behind the arcs — dark for screenshots, light for
 * checking a coastline.
 */
function BasemapPicker({
  value,
  onChange,
}: {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = getBasemap(value);

  return (
    <div className="absolute top-2 right-2 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-900/90 px-2.5 py-1.5 text-[11px] text-haze-200 backdrop-blur transition-colors hover:border-ink-500"
      >
        <Layers className="size-3.5" />
        {active.label}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close basemap menu"
            className="fixed inset-0 z-0 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute right-0 mt-1.5 w-64 overflow-hidden rounded-xl border border-ink-600 bg-ink-850/97 shadow-2xl backdrop-blur-xl">
            {BASEMAPS.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2.5 text-left transition-colors hover:bg-ink-750",
                    option.id === value && "bg-ink-750",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-haze-50">{option.label}</span>
                    <span className="text-[10px] text-haze-600">{option.provider}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-haze-500">
                    {option.note}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EmptyMapState({
  filtered,
  onClearFilter,
}: {
  filtered: boolean;
  onClearFilter: () => void;
}) {
  return (
    <div className="starfield flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-ink-600 bg-ink-850">
        <Plane className="size-5 -rotate-45 text-signal-400" />
      </div>
      <p className="max-w-xs text-sm text-haze-300">
        {filtered
          ? "No flights in this trip yet. Add one, or clear the filter."
          : "Your map is empty. Log your first flight and it will draw itself here."}
      </p>
      {filtered && (
        <Button variant="outline" size="sm" onClick={onClearFilter}>
          Show all flights
        </Button>
      )}
    </div>
  );
}
