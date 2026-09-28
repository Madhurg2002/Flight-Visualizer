import { greatCirclePoints } from "@skytrace/flight-core";
import { useEffect, useMemo, useRef, useState } from "react";

export type OrbitRoute = {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  label: string;
  /** 0-1, where the marker sits along the route. */
  markerAt?: number;
  delay?: number;
};

const RAD = Math.PI / 180;

type Projector = (lat: number, lon: number) => { x: number; y: number; visible: boolean };

/**
 * Orthographic projection centred on (lat0, lon0).
 *
 * Orthographic is the projection a real globe uses, and it is the only one
 * where a straight line on screen really is the path an aircraft flies — which
 * is the entire point of drawing flight routes on it.
 */
function makeProjector(size: number, lat0: number, lon0: number): Projector {
  const r = size / 2;
  const sin0 = Math.sin(lat0 * RAD);
  const cos0 = Math.cos(lat0 * RAD);
  return (lat, lon) => {
    const phi = lat * RAD;
    const lambda = (lon - lon0) * RAD;
    const cosC = sin0 * Math.sin(phi) + cos0 * Math.cos(phi) * Math.cos(lambda);
    return {
      x: r + r * Math.cos(phi) * Math.sin(lambda),
      y: r - r * (cos0 * Math.sin(phi) - sin0 * Math.cos(phi) * Math.cos(lambda)),
      visible: cosC >= 0,
    };
  };
}

/** Latitude/longitude graticule clipped to the visible hemisphere. */
function graticule(size: number, lat0: number, lon0: number, step = 20): string[] {
  const project = makeProjector(size, lat0, lon0);
  const paths: string[] = [];

  const draw = (points: [number, number][]) => {
    let d = "";
    let pen = false;
    for (const [lat, lon] of points) {
      const p = project(lat, lon);
      if (!p.visible) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      pen = true;
    }
    if (d) paths.push(d);
  };

  for (let lat = -80; lat <= 80; lat += step) {
    draw(Array.from({ length: 73 }, (_, i) => [lat, -180 + i * 5] as [number, number]));
  }
  for (let lon = -180; lon < 180; lon += step) {
    draw(Array.from({ length: 37 }, (_, i) => [-90 + i * 5, lon] as [number, number]));
  }
  return paths;
}

export function GlobeOrbit({
  routes,
  size = 460,
  speed = 3.6,
  className,
}: {
  routes: OrbitRoute[];
  size?: number;
  /** Full rotation in seconds. */
  speed?: number;
  className?: string;
}) {
  const [lon, setLon] = useState(-30);
  const frame = useRef(0);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (reduceMotion.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      // Clamp dt so a backgrounded tab does not jump the globe on return.
      const dt = Math.min(64, now - last);
      last = now;
      setLon((prev) => (prev + (dt / 1000) * (360 / speed)) % 360);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [speed]);

  const project = useMemo(() => makeProjector(size, 18, lon), [size, lon]);
  const grat = useMemo(() => graticule(size, 18, lon), [size, lon]);
  const radius = size / 2;

  const paths = useMemo(
    () =>
      routes.map((route, index) => {
        const points = greatCirclePoints(route.from, route.to, 72);
        const segments: string[] = [];
        let d = "";
        let pen = false;
        for (const [lat, lonDeg] of points) {
          const p = project(lat, lonDeg);
          if (!p.visible) {
            if (pen) segments.push(d);
            d = "";
            pen = false;
            continue;
          }
          d += `${pen ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
          pen = true;
        }
        if (pen) segments.push(d);

        const at = route.markerAt ?? 0.5;
        const marker = project(...interpolateLonLat(points, at));
        return {
          key: `${route.label}-${index}`,
          segments,
          marker: marker.visible ? marker : null,
          delay: (route.delay ?? index * 0.7) % 4,
        };
      }),
    [routes, project],
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Rotating globe with great-circle flight routes between major airports"
    >
      <defs>
        {/* The sphere is a sheet of paper, lit from the upper left and ruled
            with its own graticule — the way a globe is drawn on a chart. The
            stops are theme variables so the globe follows the light/dark
            switch rather than staying a bright disc on a dark page. */}
        <radialGradient id="globe-body" cx="36%" cy="28%">
          <stop offset="0%" stopColor="var(--paper-100)" />
          <stop offset="100%" stopColor="var(--paper-200)" />
        </radialGradient>
        <linearGradient id="arc-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--sky-600)" stopOpacity="0.2" />
          <stop offset="50%" stopColor="var(--chart-600)" />
          <stop offset="100%" stopColor="var(--chart-600)" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      <circle cx={radius} cy={radius} r={radius} fill="url(#globe-body)" />
      <g className="pointer-events-none">
        {grat.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--ink-300)"
            strokeOpacity={0.32}
            strokeWidth={0.6}
          />
        ))}
      </g>

      {paths.map((p) => (
        <g key={p.key}>
          {p.segments.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="url(#arc-stroke)"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          ))}
          {p.marker && (
            <circle
              cx={p.marker.x}
              cy={p.marker.y}
              r={2.4}
              fill="var(--chart-700)"
              stroke="var(--paper-100)"
              strokeWidth={1}
            >
              <animate
                attributeName="opacity"
                values="1;0.25;1"
                dur="2.4s"
                begin={`${p.delay}s`}
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      ))}

      <circle
        cx={radius}
        cy={radius}
        r={radius - 0.5}
        fill="none"
        stroke="var(--chart-600)"
        strokeOpacity={0.45}
        strokeWidth={1}
      />
    </svg>
  );
}

/** Pull a lat/lon pair out of sampled great-circle points. */
function interpolateLonLat(points: [number, number][], t: number): [number, number] {
  const index = Math.round(t * (points.length - 1));
  const [lon, lat] = points[index] ?? points[points.length - 1]!;
  return [lat, lon];
}
