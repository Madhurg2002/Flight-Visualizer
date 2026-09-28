import { useQuery } from "../lib/api";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, cn } from "@skytrace/ui";
import { yearOf } from "@skytrace/flight-core";
import { Download, LogOut, Plane } from "lucide-react";
import { AddFlightPanel } from "../components/AddFlightPanel";
import { BulkImportPanel } from "../components/BulkImportPanel";
import { FlightDetail, FlightList } from "../components/FlightList";
import type { BasemapId, ColorMode } from "../components/FlightMap";
import { MapErrorBoundary } from "../components/MapErrorBoundary";
import { BasemapPicker } from "../components/BasemapPicker";
import { RecordsPanel } from "../components/RecordsPanel";
import { StatTiles, TopAirlines } from "../components/StatTiles";
import { TripPanel } from "../components/TripPanel";
import { Spinner } from "../lib/spinner";
import { api } from "../lib/api";
import { useSignOut } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";
import { downloadTextFile, flightsToCsv } from "../lib/csv";

/**
 * deck.gl and MapLibre are ~1.9MB together. Loading the map on demand keeps
 * that weight out of the initial bundle — on the landing page it is deferred
 * further still, until the browser is idle.
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
  // A light basemap by default: the interface is printed on paper, and a
  // near-black map in the middle of it is the one thing that would clash.
  const [basemap, setBasemap] = useState<BasemapId>("openfreemap-positron");
  const [colorMode, setColorMode] = useState<ColorMode>("year");
  // Trip filter. Kept here rather than inside the list so the map and the
  // export can narrow by the same thing.
  const [tripFilter, setTripFilter] = useState<string | null>(null);
  // The text and year filters live here for the same reason, and because a
  // filter the map does not obey is worse than no filter at all: the list
  // narrows to four flights while the map still draws all eighty, and the two
  // halves of the dashboard end up answering different questions.
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");

  const all = useMemo(() => flights ?? [], [flights]);
  const tripList = useMemo(() => trips ?? [], [trips]);

  // What the trip alone leaves, which is both the starting point for the text
  // filter and the number the "3 of 12" counter measures against.
  const tripScoped = useMemo(
    () => (tripFilter ? all.filter((f) => f.tripId === tripFilter) : all),
    [all, tripFilter],
  );

  const years = useMemo(
    () => [...new Set(tripScoped.map((f) => yearOf(f.flightDate)))].sort().reverse(),
    [tripScoped],
  );

  // One filter, applied once. Everything downstream reads `list`, so the map,
  // the list and the selection can never disagree about what is being shown.
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tripScoped.filter((flight) => {
      if (year !== "all" && yearOf(flight.flightDate) !== year) return false;
      if (!q) return true;
      return [
        flight.fromIata,
        flight.toIata,
        flight.fromCity,
        flight.toCity,
        flight.fromName,
        flight.toName,
        flight.airlineName ?? "",
        flight.airlineCode ?? "",
        flight.flightNumber ?? "",
        flight.notes ?? "",
        flight.seat ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [tripScoped, query, year]);

  const selected = useMemo(
    () => all.find((f) => f.id === selectedId) ?? null,
    [all, selectedId],
  );

  if (flights === undefined || trips === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-50">
        <Spinner />
      </div>
    );
  }

  const activeTrip = tripList.find((trip) => trip.id === tripFilter) ?? null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-paper-300 bg-paper-50 px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-sm border border-chart-600/45 bg-chart-600/10">
            <Plane className="size-3.5 -rotate-45 text-chart-600" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink-900">Skytrace</span>
          <span className="font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">
            flight log
          </span>
          {email && <span className="text-xs text-ink-400">{email}</span>}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
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

      <div className="grid shrink-0 gap-2.5 bg-paper-50 p-2.5 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <StatTiles stats={stats ?? null} />
        </div>
        <div className="hidden space-y-2.5 lg:block">
          <TopAirlines stats={stats ?? null} />
          <RecordsPanel stats={stats ?? null} onSelect={setSelectedId} />
        </div>
      </div>

      <main className="grid min-h-0 flex-1 gap-2.5 bg-paper-50 px-2.5 pb-2.5 lg:grid-cols-[320px_1fr_320px]">
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
            <MapErrorBoundary onError={() => setSelectedId(null)}>
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
            </MapErrorBoundary>
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
              <p className="mb-2 flex items-center justify-between rounded-md bg-chart-600/10 px-2 py-1 text-[11px] text-chart-500">
                <span className="truncate">{activeTrip.name}</span>
                <button
                  type="button"
                  onClick={() => setTripFilter(null)}
                  className="ml-2 shrink-0 text-ink-400 transition-colors hover:text-ink-600"
                >
                  Clear
                </button>
              </p>
            )}
            <FlightList
              flights={list}
              total={tripScoped.length}
              query={query}
              onQueryChange={setQuery}
              year={year}
              onYearChange={setYear}
              years={years}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
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
function EmptyMapState({
  filtered,
  onClearFilter,
}: {
  filtered: boolean;
  onClearFilter: () => void;
}) {
  return (
    <div className="graticule flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-paper-300 bg-paper-100">
        <Plane className="size-5 -rotate-45 text-chart-600" />
      </div>
      <p className="max-w-xs text-sm text-ink-600">
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
