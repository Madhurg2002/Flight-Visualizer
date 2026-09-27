import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  formatCabin,
  formatCo2,
  formatDate,
  formatDistance,
  formatDuration,
  formatMoney,
  yearOf,
} from "@skytrace/flight-core";
import type { FlightLogWithAirports, Trip } from "@skytrace/types";
import { Input, Select, cn } from "@skytrace/ui";
import { Luggage, Search, Star, Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * `FlightLog.id` is a plain string in the shared types package, because that
 * package must not depend on the generated Convex data model. It is always an
 * `Id<"flights">` in practice, so narrow it once here.
 */
const asFlightId = (id: string) => id as Id<"flights">;

export function FlightList({
  flights,
  selectedId,
  onSelect,
}: {
  flights: FlightLogWithAirports[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const removeFlight = useMutation(api.flights.remove);
  const rateFlight = useMutation(api.flights.update);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");

  const years = useMemo(
    () => [...new Set(flights.map((f) => yearOf(f.flightDate)))].sort().reverse(),
    [flights],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flights.filter((flight) => {
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
  }, [flights, query, year]);

  if (flights.length === 0) {
    return (
      <div className="panel p-6 text-center">
        <p className="text-sm text-haze-300">No flights logged yet.</p>
        <p className="mt-1 text-xs text-haze-500">
          Describe one in the panel and it will show up on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-haze-600" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by city, airline, flight number…"
            aria-label="Filter flights"
            className="h-9 pl-8 text-[13px]"
          />
        </div>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          aria-label="Filter by year"
          className="h-9 rounded-lg border border-ink-600 bg-ink-900/80 px-2 text-[13px] text-haze-50"
        >
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <p className="tabular mt-2 px-1 text-[11px] text-haze-600">
        {visible.length} of {flights.length} flights
      </p>

      <ul className="mt-2 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {visible.map((flight) => (
          <li key={flight.id}>
            <div
              className={cn(
                "group flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                selectedId === flight.id
                  ? "border-signal-400/60 bg-signal-400/10"
                  : "border-ink-600 bg-ink-850/60 hover:border-ink-500 hover:bg-ink-800",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(flight.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="tabular text-sm font-semibold text-haze-50">
                      {flight.fromIata}
                    </span>
                    <span className="text-haze-600">→</span>
                    <span className="tabular text-sm font-semibold text-haze-50">
                      {flight.toIata}
                    </span>
                    <span className="tabular truncate text-[11px] text-haze-500">
                      {flight.flightNumber && `${flight.airlineCode ?? ""}${flight.flightNumber} · `}
                      {formatDate(flight.flightDate)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-haze-500">
                    {flight.fromCity} → {flight.toCity}
                  </p>
                </div>

                <div className="tabular hidden shrink-0 text-right text-[11px] text-haze-500 sm:block">
                  <p>{formatDistance(flight.distanceKm)}</p>
                  <p className="text-haze-600">
                    {formatDuration(flight.durationMin)} · {formatCo2(flight.co2Kg)} CO₂
                  </p>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {flight.rating !== null && (
                  <span className="flex items-center gap-0.5 pr-1 text-[10px] text-signal-400">
                    <Star className="size-3 fill-current" />
                    {flight.rating}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove rating from ${flight.fromIata} to ${flight.toIata}`}
                  onClick={() => rateFlight({ id: asFlightId(flight.id), rating: null })}
                  className="rounded p-1 text-haze-500 transition-colors hover:text-signal-400"
                >
                  <Star className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${flight.fromIata} to ${flight.toIata}`}
                  onClick={() => removeFlight({ id: asFlightId(flight.id) })}
                  className="rounded p-1 text-haze-500 transition-colors hover:text-rose-alert"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FlightDetail({
  flight,
  trips,
}: {
  flight: FlightLogWithAirports | null;
  trips: Trip[];
}) {
  const rateFlight = useMutation(api.flights.update);
  const stats = useQuery(api.flights.stats, {});
  if (!flight) return null;
  const cost = formatMoney(flight.costMinor, flight.currency);
  const trip = trips.find((t) => t.id === flight.tripId) ?? null;

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tabular text-lg font-semibold text-haze-50">
            {flight.fromIata} <span className="text-haze-600">→</span> {flight.toIata}
          </p>
          <p className="mt-0.5 text-xs text-haze-400">
            {flight.fromCity} → {flight.toCity}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((value) => {
          const filled = flight.rating !== null && value <= flight.rating;
          return (
            <button
              key={value}
              type="button"
              aria-label={`Rate ${flight.fromIata} to ${flight.toIata} ${value} of 5`}
              aria-pressed={filled}
              onClick={() =>
                rateFlight({
                  id: asFlightId(flight.id),
                  // Clicking the current rating clears it, so there is always a
                  // way back to "unrated".
                  rating: filled && value === flight.rating ? null : value,
                })
              }
              className="rounded p-0.5 transition-transform hover:scale-115"
            >
              <Star
                className={cn(
                  "size-4 transition-colors",
                  filled ? "fill-signal-400 text-signal-400" : "text-ink-500 hover:text-haze-400",
                )}
              />
            </button>
          );
        })}
      </div>

      <dl className="tabular mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
        <Detail label="Date" value={formatDate(flight.flightDate)} />
        <Detail
          label="Flight"
          value={
            flight.flightNumber
              ? `${flight.airlineCode ?? ""} ${flight.flightNumber}`
              : flight.airlineName ?? "—"
          }
        />
        <Detail label="Distance" value={formatDistance(flight.distanceKm)} />
        <Detail label="Time" value={formatDuration(flight.durationMin)} />
        <Detail label="Cabin" value={formatCabin(flight.cabin)} />
        <Detail label="Seat" value={flight.seat ?? "—"} />
        <Detail label="Aircraft" value={flight.aircraft ?? "—"} />
        <Detail label="CO₂" value={formatCo2(flight.co2Kg)} />
        {cost && <Detail label="Cost" value={cost} />}
        <Detail label="Per km" value={formatCostPerKm(flight)} />
        {stats && stats.mostVisitedCountry && (
          <Detail
            label="Most visited"
            value={`${stats.mostVisitedCountry.country} (${stats.mostVisitedCountry.arrivals}×)`}
          />
        )}
      </dl>

      {trips.length > 0 && (
        <div className="mt-4 border-t border-ink-700 pt-3">
          <label
            htmlFor={`trip-${flight.id}`}
            className="flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-haze-500 uppercase"
          >
            <Luggage className="size-3" />
            Trip
          </label>
          <Select
            id={`trip-${flight.id}`}
            className="mt-1.5 h-9 text-[13px]"
            value={flight.tripId ?? ""}
            onChange={(e) =>
              rateFlight({
                id: asFlightId(flight.id),
                tripId: e.target.value ? (e.target.value as Id<"trips">) : null,
              })
            }
          >
            <option value="">Not in a trip</option>
            {trips.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
          {trip && (
            <p className="mt-1.5 text-[11px] text-haze-600">
              One of {trip.flightCount} flight{trip.flightCount === 1 ? "" : "s"} in this
              trip.
            </p>
          )}
        </div>
      )}

      {flight.notes && (
        <p className="mt-4 border-t border-ink-700 pt-3 text-xs leading-relaxed text-haze-400">
          {flight.notes}
        </p>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-[0.08em] text-haze-600 uppercase">{label}</dt>
      <dd className="mt-0.5 text-haze-200">{value}</dd>
    </div>
  );
}

/** Cost per km for one flight, or an em dash when no fare was recorded. */
function formatCostPerKm(flight: FlightLogWithAirports): string {
  if (flight.costMinor === null || flight.distanceKm <= 0) return "—";
  const perKm = flight.costMinor / flight.distanceKm;
  return formatMoney(perKm, flight.currency) ?? "—";
}
