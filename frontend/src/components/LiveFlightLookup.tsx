import { useState } from "react";
import { Loader2, Radio, Search } from "lucide-react";
import { useQuery } from "../lib/api";
import { api, ApiError, call } from "../lib/api";
import type { LiveFlight } from "@skytrace/types";

/**
 * Ask a real provider about a flight the offline resolver could not place.
 *
 * The resolver reads a dataset of routes with no schedules, so "UA 1234" is
 * the one thing it genuinely cannot answer: it can offer the carrier's hub
 * routes and ask, which is the honest response but not a useful one. This is
 * the escape hatch, and it is offered only when the input looks like a flight
 * number and the server says a provider is configured — so with no key the UI
 * is exactly what it was before, rather than a button that always fails.
 *
 * It fills the form rather than saving, because a live schedule is a strong
 * hint and not the user's memory. They still press save, and they can correct
 * anything first.
 */
export function LiveFlightLookup({
  text,
  hasCandidates,
  onFound,
}: {
  text: string;
  /** Whether the offline resolver produced anything at all. */
  hasCandidates: boolean;
  onFound: (flight: LiveFlight) => void;
}) {
  const [busy, setBusy] = useState(false);
  // The answer is stored against the question it answers. Editing the box
  // changes the question, and an answer left on screen under a different
  // question is worse than no answer: "Found SFO → NRT" sitting under a
  // button that would now look up UA 999 is a plain misreading.
  const [answer, setAnswer] = useState<{ key: string; text: string } | null>(null);

  const status = useQuery(api.lookup.status);
  const parsed = parse(text);
  const queryKey = parsed ? `${parsed.airline}${parsed.flightNumber}${parsed.date ?? ""}` : null;
  const message = answer && answer.key === queryKey ? answer.text : null;

  // With no credentials the server answers 401 signed out, and `configured`
  // stays undefined — either way there is nothing to offer, and no button.
  if (status?.configured !== true) return null;

  if (!parsed) return null;

  async function run() {
    if (!parsed || queryKey === null) return;
    setBusy(true);
    setAnswer(null);
    try {
      const result = await call(api.lookup.flight, {
        airline: parsed.airline,
        flightNumber: parsed.flightNumber,
        ...(parsed.date ? { date: parsed.date } : {}),
      });
      if (result.flight) {
        onFound(result.flight);
        setAnswer({ key: queryKey, text: `Found ${result.flight.departure.iata} → ${result.flight.arrival.iata}.` });
      } else {
        setAnswer({ key: queryKey, text: "No provider is configured on this deployment." });
      }
    } catch (error) {
      // The server's own wording is the useful part: "try without the date"
      // is an instruction, and "the provider did not answer" is a retry.
      const text = error instanceof ApiError ? error.message : "The lookup failed.";
      setAnswer({ key: queryKey, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-paper-300 bg-paper-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <Radio className="size-3.5 shrink-0" />
          <span>
            {hasCandidates ? (
              <>
                Those are guesses — {parsed.airline}
                {parsed.flightNumber} is not in the offline dataset, which has
                routes but no schedules. Check the real one?
              </>
            ) : (
              <>
                {parsed.airline}
                {parsed.flightNumber} is not in the offline dataset. Check it
                against live schedules?
              </>
            )}
          </span>
        </p>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-paper-300 bg-paper-100 px-2.5 py-1 text-[11px] font-medium text-ink-700 transition hover:bg-paper-200 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
          {busy ? "Looking up" : "Look it up"}
        </button>
      </div>
      {message && <p className="mt-2 text-[11px] text-ink-400">{message}</p>}
    </div>
  );
}

/** `UA 1234`, `UA1234`, optionally with a date the user already gave. */
function parse(text: string): { airline: string; flightNumber: string; date?: string } | null {
  const trimmed = text.trim();
  const match = /(?:^|\s)([A-Z]{2,3})\s*[- ]?\s*(\d{1,5}[A-Z]?)\b/i.exec(trimmed);
  if (!match) return null;
  const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(trimmed)?.[1];
  return {
    airline: match[1]!.toUpperCase(),
    flightNumber: match[2]!.toUpperCase(),
    ...(date ? { date } : {}),
  };
}
