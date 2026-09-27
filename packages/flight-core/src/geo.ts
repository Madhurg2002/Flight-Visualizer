/** Great-circle geometry and duration estimation. Pure functions, no deps. */

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export type LatLon = { lat: number; lon: number };

/** Haversine great-circle distance in kilometres. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Block time in minutes, including taxi.
 *
 * This is an estimate, not a schedule: a 3,500 km sector flies for roughly
 * 4.5 hours, plus ~25 minutes of taxi, climb and approach. Short sectors get a
 * floor because the fixed ground time dominates.
 */
export function estimateDurationMin(distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  const cruiseKmh = 860;
  const taxiMin = 30;
  return Math.round(taxiMin + (distanceKm / cruiseKmh) * 60);
}

/**
 * Sample a great-circle path between two points as `[lon, lat]` pairs.
 *
 * Used for the map's own arc geometry. Interpolating in 3D and projecting back
 * keeps the curve on the sphere; lerping lat/lon directly flattens the path
 * towards the poles and makes long polar routes look wrong.
 */
export function greatCirclePoints(a: LatLon, b: LatLon, steps = 64): [number, number][] {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);

  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((lat2 - lat1) / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
        ),
      ),
    );

  // Coincident endpoints have no defined great circle; return a degenerate path.
  if (d < 1e-9) return [[a.lon, a.lat], [b.lon, b.lat]];

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return points;
}

/** The point halfway along a great circle, for placing a distance label. */
export function midpoint(a: LatLon, b: LatLon): LatLon {
  const [lon, lat] = greatCirclePoints(a, b, 2)[1]!;
  return { lat, lon };
}

/** Point a fraction of the way along a great circle, clamped to `0..1`. */
export function interpolate(a: LatLon, b: LatLon, t: number): LatLon {
  const clamped = Math.max(0, Math.min(1, t));
  const [lon, lat] = greatCirclePoints(a, b, 64)[Math.round(clamped * 64)]!;
  return { lat, lon };
}
