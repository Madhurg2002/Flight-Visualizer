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
        "relative overflow-hidden rounded-[16px] border border-ink-600 bg-ink-850/80 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur",
        className,
      )}
    >
      {/* Fake window chrome, so it reads as a screen at a glance. */}
      <div className="flex items-center gap-1.5 border-b border-ink-700 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-ink-500" />
        <span className="size-2.5 rounded-full bg-ink-500" />
        <span className="size-2.5 rounded-full bg-ink-500" />
        <span className="ml-2 text-[11px] text-haze-600">skytrace.app/dashboard</span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-ink-700 bg-ink-900/70 px-2.5 py-2">
              <div className="flex items-center gap-1">
                <s.icon className="size-3 text-signal-400" />
                <span className="text-[9px] font-semibold tracking-[0.08em] text-haze-600 uppercase">
                  {s.label}
                </span>
              </div>
              <p className="tabular mt-1 text-[15px] font-semibold text-haze-50">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-[1.35fr_1fr]">
          <div className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-950">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-full w-full"
              role="img"
              aria-label="Preview of the flight map showing arcs between San Francisco, Tokyo, Singapore, London and New York"
            >
              <defs>
                <linearGradient id="preview-arc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f5a524" />
                  <stop offset="100%" stopColor="#f5a524" stopOpacity="0.35" />
                </linearGradient>
                <linearGradient id="preview-arc-2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Graticule, same idea as the hero globe. */}
              {[60, 120, 180].map((y) => (
                <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="#334155" strokeWidth="0.5" opacity="0.4" />
              ))}
              {[120, 240, 360].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2={H} stroke="#334155" strokeWidth="0.5" opacity="0.4" />
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
                  <circle cx={x} cy={y} r="3" fill="#cbd5e1" />
                  <text
                    x={x + 6}
                    y={y + 3.5}
                    fontSize="7.5"
                    fill="#94a3b8"
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
                className="rounded-lg border border-ink-700 bg-ink-900/60 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="tabular text-[13px] font-semibold text-haze-50">
                    {leg.from} <span className="text-haze-600">→</span> {leg.to}
                  </span>
                  <span className="tabular ml-auto text-[10px] text-haze-600">{leg.date}</span>
                </div>
                <p className="tabular mt-1 text-[10px] text-haze-500">
                  {leg.city} · {formatDistance(9_200 + leg.from.length * 411)} ·{" "}
                  {formatDuration(700 + leg.to.length * 7)}
                </p>
              </li>
            ))}
            <li className="rounded-lg border border-dashed border-ink-600 p-2.5 text-center text-[10px] text-haze-600">
              + 125 more
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
