import { useMutation, useQuery } from "../lib/api";
import { useState } from "react";
import { Button, Input, cn } from "@skytrace/ui";
import { Luggage, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { formatDate, todayIso } from "@skytrace/flight-core";

/**
 * Trips.
 *
 * The backend has had `trips` since the start; this is the missing half — a way
 * to name a journey, put flights in it, and filter the log down to it. A trip
 * is only a label over existing flights, so creating one never touches the
 * flights themselves and deleting one never deletes anything.
 */
export function TripPanel({
  activeTripId,
  onFilterChange,
}: {
  /** The trip the log is currently filtered to, or null for the whole log. */
  activeTripId: string | null;
  onFilterChange: (tripId: string | null) => void;
}) {
  const trips = useQuery(api.trips.list, {});
  const createTrip = useMutation(api.trips.create);
  const removeTrip = useMutation(api.trips.remove);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = trips ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createTrip({
        name: name.trim(),
        startDate,
        ...(endDate ? { endDate } : {}),
      });
      setName("");
      setEndDate("");
      setAdding(false);
      onFilterChange(id);
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^Error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[0.14em] text-ink-500 uppercase">
          <Luggage className="size-3.5 text-chart-600" />
          Trips
        </h2>
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="flex items-center gap-1 text-[11px] text-ink-400 transition-colors hover:text-chart-600"
        >
          <Plus className="size-3" />
          {adding ? "Cancel" : "New trip"}
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="mt-3 space-y-2 border-t border-paper-300 pt-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Japan, spring 2025"
            aria-label="Trip name"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              aria-label="Start date"
              className="tabular"
            />
            <Input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-label="End date, optional"
              className="tabular"
            />
          </div>
          {error && <p className="text-[11px] text-rust-600">{error}</p>}
          <Button type="submit" variant="primary" size="sm" disabled={!name.trim() || busy}>
            {busy ? "Creating…" : "Create trip"}
          </Button>
        </form>
      )}

      {list.length === 0 && !adding ? (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
          Group a run of flights into one journey — "Japan 2025" — and filter the log
          down to it.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          <li>
            <button
              type="button"
              onClick={() => onFilterChange(null)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                activeTripId === null
                  ? "bg-chart-600/10 text-chart-600"
                  : "text-ink-500 hover:bg-paper-200",
              )}
            >
              All flights
            </button>
          </li>
          {list.map((trip) => {
            const active = activeTripId === trip.id;
            return (
              <li key={trip.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onFilterChange(active ? null : trip.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    active
                      ? "bg-chart-600/10 text-chart-600"
                      : "text-ink-500 hover:bg-paper-200",
                  )}
                >
                  <span className="truncate">{trip.name}</span>
                  <span className="tabular shrink-0 text-[10px] text-ink-400">
                    {trip.flightCount}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete trip ${trip.name}`}
                  title={`${formatDate(trip.startDate)}${trip.endDate ? ` – ${formatDate(trip.endDate)}` : ""}`}
                  onClick={() => {
                    void removeTrip({ id: trip.id });
                    if (active) onFilterChange(null);
                  }}
                  className="rounded p-1 text-ink-400 opacity-0 transition-all hover:text-rust-600 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
