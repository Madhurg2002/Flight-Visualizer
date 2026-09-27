import { useMemo } from "react";
import {
  formatDistance,
  formatDuration,
  formatMoney,
} from "@skytrace/flight-core";
import type { FlightStats, LongestFlight } from "@skytrace/types";
import { cn } from "@skytrace/ui";
import { Award, Coins, Repeat2, TrendingUp } from "lucide-react";

/**
 * The superlatives.
 *
 * A tally of totals is interesting; "your longest flight was LHR→SIN, 15h 12m"
 * is the kind of line people screenshot. All of it is already in the stats
 * query — this is where it stops being a number and becomes an answer.
 */
export function RecordsPanel({
  stats,
  onSelect,
}: {
  stats: FlightStats | null;
  onSelect: (id: string) => void;
}) {
  const currency = stats?.spendCurrency ?? null;

  const spendPeak = useMemo(
    () => Math.max(1, ...(stats?.spendByYear ?? []).map((row) => row.minor)),
    [stats],
  );

  if (!stats || stats.flightCount === 0) return null;

  const hasRecords = stats.longestFlight !== null;
  const hasSpend = stats.costPerKmMinor !== null;
  const hasRepeats = stats.repeatedRoutes.length > 0;

  if (!hasRecords && !hasSpend && !hasRepeats) return null;

  return (
    <div className="panel p-4">
      <p className="text-[10px] font-semibold tracking-[0.08em] text-haze-500 uppercase">
        Records
      </p>

      <div className="mt-3 space-y-2.5">
        {stats.longestFlight && (
          <Record
            icon={Award}
            label="Longest flight"
            accent="text-signal-400"
            flight={stats.longestFlight}
            onSelect={onSelect}
          />
        )}
        {stats.shortestFlight && stats.shortestFlight.id !== stats.longestFlight?.id && (
          <Record
            icon={TrendingUp}
            label="Shortest flight"
            accent="text-teal-accent"
            flight={stats.shortestFlight}
            onSelect={onSelect}
          />
        )}

        {hasSpend && (
          <div className="rounded-lg border border-ink-600 bg-ink-900/50 p-2.5">
            <div className="flex items-center gap-1.5">
              <Coins className={cn("size-3.5", "text-signal-400")} />
              <span className="text-[10px] tracking-[0.08em] text-haze-500 uppercase">
                What you paid to fly
              </span>
            </div>
            <p className="tabular mt-1.5 text-base font-semibold text-haze-50">
              {formatMoney(stats.totalSpendMinor, currency)}
              <span className="ml-2 text-[11px] font-normal text-haze-500">
                across {stats.pricedFlightCount} priced flight
                {stats.pricedFlightCount === 1 ? "" : "s"}
              </span>
            </p>
            <p className="tabular mt-0.5 text-[11px] text-haze-400">
              {formatMoney(stats.costPerKmMinor, currency)} per km ·{" "}
              {formatMoney(
                stats.pricedFlightCount === 0
                  ? null
                  : Math.round(stats.totalSpendMinor / stats.pricedFlightCount),
                currency,
              )}{" "}
              per flight on average
            </p>

            {stats.spendByYear.length > 1 && (
              <div className="mt-2.5 flex items-end gap-1.5" style={{ height: 34 }}>
                {stats.spendByYear.map((row) => (
                  <div
                    key={row.year}
                    title={`${row.year}: ${formatMoney(row.minor, currency)}`}
                    className="flex-1 rounded-t bg-gradient-to-t from-teal-accent/40 to-teal-accent/80"
                    style={{ height: `${Math.max(8, (row.minor / spendPeak) * 100)}%` }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {hasRepeats && (
          <div className="rounded-lg border border-ink-600 bg-ink-900/50 p-2.5">
            <div className="flex items-center gap-1.5">
              <Repeat2 className="size-3.5 text-signal-400" />
              <span className="text-[10px] tracking-[0.08em] text-haze-500 uppercase">
                Routes you keep flying
              </span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {stats.repeatedRoutes.map((route) => (
                <li
                  key={`${route.fromIata}-${route.toIata}`}
                  className="flex items-baseline justify-between gap-2 text-[11px]"
                >
                  <span className="tabular text-haze-300">
                    {route.fromIata}
                    <span className="mx-1 text-haze-600">↔</span>
                    {route.toIata}
                    <span className="ml-1.5 text-haze-600">
                      {route.firstDate.slice(0, 7)}–{route.lastDate.slice(0, 7)}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-haze-500">
                    ×{route.count} · {formatDistance(route.distanceKm)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-haze-600">
              {stats.repeatFlightCount} of {stats.flightCount} flights were on a route you
              had already flown.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Record({
  icon: Icon,
  label,
  accent,
  flight,
  onSelect,
}: {
  icon: typeof Award;
  label: string;
  accent: string;
  flight: LongestFlight;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(flight.id)}
      className="w-full rounded-lg border border-ink-600 bg-ink-900/50 p-2.5 text-left transition-colors hover:border-signal-400/40 hover:bg-ink-800"
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("size-3.5", accent)} />
        <span className="text-[10px] tracking-[0.08em] text-haze-500 uppercase">
          {label}
        </span>
      </div>
      <p className="tabular mt-1.5 text-sm font-semibold text-haze-50">
        {flight.fromIata} <span className="text-haze-600">→</span> {flight.toIata}
        <span className="ml-2 text-[11px] font-normal text-haze-500">
          {flight.fromCity} → {flight.toCity}
        </span>
      </p>
      <p className="tabular mt-0.5 text-[11px] text-haze-400">
        {formatDistance(flight.distanceKm)} · {formatDuration(flight.durationMin)} ·{" "}
        {flight.flightDate}
      </p>
    </button>
  );
}
