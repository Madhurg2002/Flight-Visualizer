import type { Cabin } from "@skytrace/types";

/**
 * Per-passenger CO2 in kilograms, from great-circle distance.
 *
 * The base factor is a long-run average for a single economy seat including
 * fuel burn for the whole flight divided by the cabin, not a per-seat figure —
 * an empty seat still burns fuel. Short sectors are uplifted because climb and
 * descent dominate and the aircraft is in its least efficient regime.
 *
 * These are honest estimates for comparing your own log, not an offset claim.
 */
const KG_CO2_PER_PASSENGER_KM = 0.158;

/** Wider seats, more mass, and better load factors in the premium cabins. */
const CABIN_FACTOR: Record<Cabin, number> = {
  economy: 1,
  premium_economy: 1.6,
  business: 3.9,
  first: 6.2,
};

export function co2Kg(distanceKm: number, cabin: Cabin | null = null): number {
  if (distanceKm <= 0) return 0;
  const cabinFactor = CABIN_FACTOR[cabin ?? "economy"];

  // Under ~1500km, taxi/climb/approach is a large share of the total burn.
  const shortHaulUplift = distanceKm < 1500 ? 1 + 0.28 * (1 - distanceKm / 1500) : 1;

  return Math.round(distanceKm * KG_CO2_PER_PASSENGER_KM * cabinFactor * shortHaulUplift);
}
