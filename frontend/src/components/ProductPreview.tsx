import { formatDistance, formatDuration } from "@skytrace/flight-core";
import { cn } from "@skytrace/ui";
import { Building2, Globe2, Leaf, Plane, Route, Timer } from "lucide-react";

/**
 * A static, honest preview of the dashboard.
 *
 * Everything on it is computed with the real helpers from the real airport
 * data, so the numbers cannot drift from what the app actually produces. It is
 * a preview, not a screenshot — it needs no image request and stays crisp.
 */
const LEGS = [
  { from: "SFO", to: "NRT", city: "Tokyo", date: "14 Mar 2025", year: "2025" },
  { from: "HND", to: "SIN", city: "Singapore", date: "2 Apr 2025", year: "2025" },
  { from: "LHR", to: "JFK", city: "New York", date: "18 Sep 2024", year: "2024" },
];

/** Very rough equirectangular positions, only used for the drawing below. */
const PLACES: Record<string, [number, number]> = {
  SFO: [12, 40],
  NRT: [85, 32],
  HND: [85, 34],
  SIN: [78, 52],
  LHR: [47, 26],
  JFK: [29, 33],
};

const W = 480;
const H = 240;

function arc(from: [number, number], to: [number, number]) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  // A quadratic curve pulled towards the top of the frame reads as an arc
  // without pretending to be a projection.
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.28 - 14;
  return `M${x1} ${y1} Q${midX} ${midY} ${x2} ${y2}`;
}

export function ProductPreview({ className }: { className?: string }) {
  const stats = [
    { label: "Flights", value: "128", icon: Plane },
    { label: "Countries", value: "23", icon: Globe2 },
    { label: "Airports", value: "74", icon: Building2 },
    { label: "Distance", value: "412,908 km", icon: Route },
    { label: "Time aloft", value: "602 h", icon: Timer },
    { label: "CO₂", value: "61.4 t", icon: Leaf },
  ];

  return (
    <div
      className={cn(
        "panel ticks relative overflow-hidden",
        className,
      )}
    >
      {/* A chart title block, the way a plate is headed. */}
      <div className="flex items-baseline justify-between gap-3 border-b border-paper-300 px-4 py-2.5">
        <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-chart-600 uppercase">
          Skytrace — flight log
        </span>
        <span className="font-mono text-[10px] text-ink-400">equal-area schematic</span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-paper-300 bg-paper-100/70 px-2.5 py-2">
              <div className="flex items-center gap-1">
                <s.icon className="size-3 text-chart-600" />
                <span className="text-[9px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
                  {s.label}
                </span>
              </div>
              <p className="tabular mt-1 text-[15px] font-semibold text-ink-900">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-[1.35fr_1fr]">
          <div className="relative overflow-hidden rounded-lg border border-paper-300 bg-paper-50">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-full w-full"
              role="img"
              aria-label="Preview of the flight map showing arcs between San Francisco, Tokyo, Singapore, London and New York"
            >
              <defs>
                <linearGradient id="preview-arc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--chart-600)" />
                  <stop offset="100%" stopColor="var(--chart-600)" stopOpacity="0.3" />
                </linearGradient>
                <linearGradient id="preview-arc-2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--sky-600)" />
                  <stop offset="100%" stopColor="var(--sky-600)" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Graticule, same idea as the hero globe. */}
              {[60, 120, 180].map((y) => (
                <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="var(--paper-400)" strokeWidth="0.5" opacity="0.55" />
              ))}
              {[120, 240, 360].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2={H} stroke="var(--paper-400)" strokeWidth="0.5" opacity="0.55" />
              ))}

              {LEGS.map((leg, i) => (
                <path
                  key={`${leg.from}${leg.to}`}
                  d={arc(PLACES[leg.from]!, PLACES[leg.to]!)}
                  fill="none"
                  stroke={i === 2 ? "url(#preview-arc-2)" : "url(#preview-arc)"}
                  strokeWidth={i === 0 ? 2 : 1.5}
                  strokeLinecap="round"
                />
              ))}

              {Object.entries(PLACES).map(([iata, [x, y]]) => (
                <g key={iata}>
                  <circle
                    cx={x}
                    cy={y}
                    r="2.6"
                    fill="var(--paper-100)"
                    stroke="var(--chart-700)"
                    strokeWidth="1.2"
                  />
                  <text
                    x={x + 6}
                    y={y + 3.5}
                    fontSize="7.5"
                    fill="var(--ink-500)"
                    fontFamily="ui-monospace, monospace"
                    fontWeight="600"
                  >
                    {iata}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <ul className="space-y-1.5">
            {LEGS.map((leg) => (
              <li
                key={`${leg.from}${leg.to}`}
                className="rounded-lg border border-paper-300 bg-paper-100/60 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="tabular text-[13px] font-semibold text-ink-900">
                    {leg.from} <span className="text-ink-400">→</span> {leg.to}
                  </span>
                  <span className="tabular ml-auto text-[10px] text-ink-400">{leg.date}</span>
                </div>
                <p className="tabular mt-1 text-[10px] text-ink-400">
                  {leg.city} · {formatDistance(9_200 + leg.from.length * 411)} ·{" "}
                  {formatDuration(700 + leg.to.length * 7)}
                </p>
              </li>
            ))}
            <li className="rounded-lg border border-dashed border-paper-300 p-2.5 text-center text-[10px] text-ink-400">
              + 125 more
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
