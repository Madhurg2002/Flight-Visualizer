import { useQuery } from "../lib/api";
import { useState } from "react";
import { formatDistance, formatDuration } from "@skytrace/flight-core";
import type { MatchConfidence } from "@skytrace/types";
import { Button, Input, cn } from "@skytrace/ui";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { Spinner } from "../lib/spinner";

const EXAMPLES = [
  "United to Tokyo in March 2025",
  "SFO to JFK",
  "Emirates 203",
];

const CONFIDENCE_STYLE: Record<MatchConfidence, string> = {
  exact: "border-sky-600/40 bg-sky-600/10 text-sky-600",
  high: "border-chart-600/40 bg-chart-600/10 text-chart-600",
  medium: "border-paper-400 bg-paper-200 text-ink-500",
  low: "border-paper-300 bg-paper-200 text-ink-400",
};

/**
 * The resolver running for real, on the landing page.
 *
 * It is deliberately not a video or a mock-up: the same resolve endpoint the
 * dashboard uses answers these, signed out, so the first thing a visitor sees
 * is the actual feature working.
 */
export function ResolverDemo() {
  const [text, setText] = useState(EXAMPLES[0]!);
  const [submitted, setSubmitted] = useState(EXAMPLES[0]!);
  const result = useQuery(api.resolve.resolve, { query: submitted });

  return (
    <div className="panel flex h-full flex-col p-5 sm:p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) setSubmitted(text.trim());
        }}
        className="flex gap-2"
      >
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
        <Button type="submit" variant="primary">
          Resolve
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setText(example);
              setSubmitted(example);
            }}
            className={cn(
              "rounded-full border border-paper-300 px-2.5 py-1 text-[11px] text-ink-500 transition-colors",
              "hover:border-chart-600/60 hover:text-chart-700",
              submitted === example && "border-chart-600/60 bg-chart-600/10 text-chart-600",
            )}
          >
            {example}
          </button>
        ))}
      </div>

      <div className="mt-5 flex-1">
        {result === undefined ? (
          <div className="flex h-full items-center justify-center py-10">
            <Spinner />
          </div>
        ) : result.candidates.length === 0 ? (
          <EmptyResult text={submitted} />
        ) : (
          <ul className="space-y-2.5">
            {result.candidates.slice(0, 3).map((candidate) => (
              <li
                key={candidate.key}
                className="rounded-xl border border-paper-300 bg-paper-100/60 p-3.5 transition-colors hover:border-paper-400"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="tabular text-base font-semibold text-ink-900">
                      {candidate.fromIata}
                    </span>
                    <ArrowRight className="size-3.5 text-ink-400" />
                    <span className="tabular text-base font-semibold text-ink-900">
                      {candidate.toIata}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                      CONFIDENCE_STYLE[candidate.confidence],
                    )}
                  >
                    {candidate.confidence}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-ink-500">{candidate.reason}</p>

                <div className="tabular mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-400">
                  <span>{formatDistance(candidate.distanceKm)}</span>
                  <span>{formatDuration(candidate.durationMin)}</span>
                  {candidate.date && <span>{candidate.date}</span>}
                  {candidate.flightNumber && <span>№ {candidate.flightNumber}</span>}
                </div>
              </li>
            ))}

            {result.missing.length > 0 && (
              <li className="flex items-center gap-2 pt-1 text-[11px] text-ink-400">
                <Sparkles className="size-3 text-chart-700" />
                Still needs: {result.missing.join(", ")}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyResult({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-paper-300 p-5 text-center">
      <p className="text-sm text-ink-600">
        We could not make sense of{" "}
        <span className="text-ink-900">“{text}”</span>
      </p>
      <p className="mt-1.5 text-xs text-ink-400">
        Try an airport pair like “LHR to JFK”, or an airline and a city.
      </p>
    </div>
  );
}
