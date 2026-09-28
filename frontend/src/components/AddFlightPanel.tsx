import { useMutation } from "../lib/api";
import { useEffect, useState } from "react";
import { useQuery } from "../lib/api";
import {
  formatCabin,
  formatDistance,
  formatDuration,
  todayIso,
} from "@skytrace/flight-core";
import type { Cabin, FlightCandidate, MatchConfidence, Trip } from "@skytrace/types";
import { Button, Input, Label, Select, Textarea, cn } from "@skytrace/ui";
import { ArrowRight, Plus, Search, Sparkles, TriangleAlert } from "lucide-react";
import { AirportAutocomplete } from "./AirportAutocomplete";
import { api } from "../lib/api";

const CONFIDENCE_STYLE: Record<MatchConfidence, string> = {
  exact: "border-sky-600/40 bg-sky-600/10 text-sky-600",
  high: "border-chart-600/40 bg-chart-600/10 text-chart-600",
  medium: "border-paper-400 bg-paper-200 text-ink-500",
  low: "border-paper-300 bg-paper-200 text-ink-400",
};

const CABINS: Cabin[] = ["economy", "premium_economy", "business", "first"];

type Draft = {
  fromIata: string;
  toIata: string;
  flightDate: string;
  airlineCode?: string;
  airlineName?: string;
  flightNumber?: string;
  cabin?: Cabin;
  seat?: string;
  aircraft?: string;
  costMinor?: number;
  notes?: string;
  tripId?: string;
};

/**
 * The add-flight flow.
 *
 * Two stages on purpose. Free text gets you most of the way and the resolver
 * says what it is unsure about; the details form is always available so the
 * user is never stuck behind a guess they cannot correct.
 */
export function AddFlightPanel({
  onAdded,
  trips,
}: {
  onAdded: () => void;
  trips: Trip[];
}) {
  const addFlight = useMutation(api.flights.add);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const result = useQuery(
    api.resolve.resolve,
    submitted === null ? "skip" : { query: submitted },
  );

  // Pre-fill the details form from the chosen candidate, but only when there
  // is no draft yet — otherwise typing in the form would be clobbered.
  useEffect(() => {
    if (draft || !result?.candidates.length) return;
    const best = result.candidates[0]!;
    setDraftFromCandidate(best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, draft]);

  function setDraftFromCandidate(candidate: FlightCandidate) {
    setDraft({
      fromIata: candidate.fromIata,
      toIata: candidate.toIata,
      flightDate: candidate.date ?? todayIso(),
      ...(candidate.airlineCode ? { airlineCode: candidate.airlineCode } : {}),
      ...(candidate.airlineName ? { airlineName: candidate.airlineName } : {}),
      ...(candidate.flightNumber ? { flightNumber: candidate.flightNumber } : {}),
    });
  }

  function reset() {
    setText("");
    setSubmitted(null);
    setDraft(null);
    setError(null);
  }

  function runResolve(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setError(null);
    setDraft(null);
    setSubmitted(text.trim());
  }

  async function save(allowDuplicate = false) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      // The trip is held as a plain string in the draft because it comes from a
      // <select>; narrow it once at the boundary.
      const { tripId, ...rest } = draft;
      await addFlight({
        ...rest,
        ...(tripId ? { tripId } : {}),
        source: submitted && draft.fromIata && draft.toIata ? "resolved" : "manual",
        allowDuplicate,
      });
      reset();
      onAdded();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("ALREADY_LOGGED:")) {
        // Offer it as a choice instead of silently failing or auto-adding.
        setError("DUPLICATE");
        setBusy(false);
        return;
      }
      setError(message.replace(/^Error:\s*/, ""));
      setBusy(false);
    }
  }

  return (
    <div className="panel p-5">
      <h2 className="font-mono text-[11px] font-medium tracking-[0.14em] text-ink-500 uppercase">
        Log a flight
      </h2>

      <form onSubmit={runResolve} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="United to Tokyo in March 2025"
            aria-label="Describe a flight you remember"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="primary" disabled={!text.trim()}>
          Find
        </Button>
      </form>

      {result && submitted !== null && !draft && (
        <div className="mt-4">
          {result.candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-paper-300 p-3 text-xs text-ink-400">
              Nothing matched “{submitted}”. Enter the details by hand below.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-ink-400">
                Pick the one you meant. Every option says why it is here.
              </p>
              <ul className="mt-2 space-y-2">
                {result.candidates.slice(0, 4).map((candidate) => (
                  <li key={candidate.key}>
                    <button
                      type="button"
                      onClick={() => setDraftFromCandidate(candidate)}
                      className="w-full rounded-lg border border-paper-300 bg-paper-100/60 p-3 text-left transition-colors hover:border-chart-600/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="tabular flex items-center gap-2 text-sm font-semibold text-ink-900">
                          {candidate.fromIata}
                          <ArrowRight className="size-3 text-ink-400" />
                          {candidate.toIata}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase",
                            CONFIDENCE_STYLE[candidate.confidence],
                          )}
                        >
                          {candidate.confidence}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
                        {candidate.reason}
                      </p>
                      <p className="tabular mt-1.5 text-[10px] text-ink-400">
                        {formatDistance(candidate.distanceKm)} ·{" "}
                        {formatDuration(candidate.durationMin)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {draft && (
        <div className="mt-5 border-t border-paper-300 pt-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
              <Sparkles className="size-3.5 text-chart-600" />
              Check the details
            </p>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-ink-400 transition-colors hover:text-ink-500"
            >
              Start over
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="From" hint="search or type a code">
              <AirportAutocomplete
                value={draft.fromIata}
                onChange={(iata) => setDraft({ ...draft, fromIata: iata })}
                label="Origin airport"
              />
            </Field>
            <Field label="To" hint="search or type a code">
              <AirportAutocomplete
                value={draft.toIata}
                onChange={(iata) => setDraft({ ...draft, toIata: iata })}
                label="Destination airport"
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={draft.flightDate}
                onChange={(e) => setDraft({ ...draft, flightDate: e.target.value })}
              />
            </Field>
            <Field label="Flight number">
              <Input
                value={draft.flightNumber ?? ""}
                placeholder="e.g. 1234"
                onChange={(e) =>
                  setDraft({ ...draft, flightNumber: e.target.value.toUpperCase() })
                }
                className="tabular"
              />
            </Field>
            <Field label="Airline code">
              <Input
                value={draft.airlineCode ?? ""}
                placeholder="UA"
                maxLength={3}
                onChange={(e) => setDraft({ ...draft, airlineCode: e.target.value.toUpperCase() })}
                className="tabular uppercase"
              />
            </Field>
            <Field label="Cabin">
              <Select
                value={draft.cabin ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  const next = { ...draft };
                  if (value) next.cabin = value as Cabin;
                  else delete next.cabin;
                  setDraft(next);
                }}
              >
                <option value="">Not recorded</option>
                {CABINS.map((c) => (
                  <option key={c} value={c}>
                    {formatCabin(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seat">
              <Input
                value={draft.seat ?? ""}
                placeholder="14A"
                onChange={(e) => setDraft({ ...draft, seat: e.target.value.toUpperCase() })}
                className="tabular"
              />
            </Field>
            <Field label="Cost">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={draft.costMinor !== undefined ? draft.costMinor / 100 : ""}
                placeholder="0.00"
                onChange={(e) => {
                  const value = e.target.value;
                  const next = { ...draft };
                  if (value === "") delete next.costMinor;
                  else next.costMinor = Math.round(Number(value) * 100);
                  setDraft(next);
                }}
              />
            </Field>
            {trips.length > 0 && (
              <Field label="Trip">
                <Select
                  value={draft.tripId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    const next = { ...draft };
                    if (value) next.tripId = value;
                    else delete next.tripId;
                    setDraft(next);
                  }}
                >
                  <option value="">Not in a trip</option>
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <div className="mt-3">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              className="mt-1.5 min-h-16"
              placeholder="Window seat, decent meal, boarding took forever…"
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>

          {error === "DUPLICATE" ? (
            <div className="mt-4 rounded-lg border border-chart-600/30 bg-chart-600/10 p-3">
              <p className="flex items-start gap-2 text-[13px] text-chart-500">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                You have already logged this exact flight.
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => save(true)} disabled={busy}>
                  Log it anyway
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setError(null)}>
                  Change the details
                </Button>
              </div>
            </div>
          ) : (
            error && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-rust-600/30 bg-rust-600/10 px-3 py-2 text-[13px] text-rust-600"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )
          )}

          <Button
            variant="primary"
            className="mt-4 w-full"
            onClick={() => save(false)}
            disabled={busy || !draft.fromIata || !draft.toIata || !draft.flightDate}
          >
            <Plus />
            {busy ? "Saving…" : "Add to my log"}
          </Button>
        </div>
      )}

      {!draft && submitted === null && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
          Or skip the search — fill in the codes and date yourself.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>
        {label}
        {hint && <span className="ml-1 font-normal text-ink-400 normal-case">{hint}</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
