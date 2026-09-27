import {
  formatCo2,
  formatDistance,
  formatTotalDuration,
} from "@skytrace/flight-core";
import type { FlightStats } from "@skytrace/types";
import { cn } from "@skytrace/ui";
import { Building2, Globe2, Leaf, Plane, Route, Timer } from "lucide-react";

export function StatTiles({ stats }: { stats: FlightStats | null }) {
  if (!stats) return null;

  const tiles = [
    { label: "Flights", value: stats.flightCount.toLocaleString("en"), icon: Plane },
    { label: "Countries", value: stats.countryCount.toLocaleString("en"), icon: Globe2 },
    { label: "Airports", value: stats.airportCount.toLocaleString("en"), icon: Building2 },
    { label: "Distance", value: formatDistance(stats.totalDistanceKm), icon: Route },
    { label: "Time aloft", value: formatTotalDuration(stats.totalDurationMin), icon: Timer },
    { label: "CO₂", value: formatCo2(stats.totalCo2Kg), icon: Leaf },
  ];

  const peak = Math.max(1, ...stats.flightsByYear.map((y) => y.distanceKm));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="panel px-3.5 py-3">
            <div className="flex items-center gap-1.5">
              <tile.icon className="size-3.5 text-signal-400" />
              <span className="text-[10px] font-semibold tracking-[0.08em] text-haze-500 uppercase">
                {tile.label}
              </span>
            </div>
            <p className="tabular mt-1.5 text-xl font-semibold text-haze-50">{tile.value}</p>
          </div>
        ))}
      </div>

      {stats.flightsByYear.length > 0 && (
        <div className="panel mt-2.5 p-4">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-haze-500 uppercase">
            Distance by year
          </p>
          <div className="mt-3 flex items-end gap-2" style={{ height: 72 }}>
            {stats.flightsByYear.map((year) => (
              <div key={year.year} className="group relative flex flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-signal-500/45 to-signal-400 transition-colors group-hover:from-signal-500/70 group-hover:to-signal-300"
                  style={{ height: `${Math.max(6, (year.distanceKm / peak) * 100)}%` }}
                />
                <span className="tabular mt-1.5 text-center text-[9px] text-haze-600">
                  {year.year.slice(2)}
                </span>
                <span className="tabular pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded-md border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[9px] whitespace-nowrap text-haze-200 opacity-0 transition-opacity group-hover:opacity-100">
                  {year.count} flights · {formatDistance(year.distanceKm)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopAirlines({ stats }: { stats: FlightStats | null }) {
  if (!stats || stats.topAirlines.length === 0) return null;
  const top = stats.topAirlines[0]!.count;

  return (
    <div className="panel p-4">
      <p className="text-[10px] font-semibold tracking-[0.08em] text-haze-500 uppercase">
        Most flown
      </p>
      <ul className="mt-3 space-y-2.5">
        {stats.topAirlines.map((airline) => (
          <li key={airline.code ?? "unknown"}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-haze-200">
                {airline.name ?? airline.code ?? "Unrecorded"}
              </span>
              <span className="tabular text-haze-500">{airline.count}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-700">
              <div
                className={cn("h-full rounded-full bg-teal-accent/70")}
                style={{ width: `${(airline.count / top) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
