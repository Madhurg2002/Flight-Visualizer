import { amadeusProvider } from "./amadeus.ts";
import type { FlightLookupQuery, FlightProvider, LookupResult } from "./types.ts";

/**
 * Which provider answers. Adding a second one is a line here and a new file
 * beside `amadeus.ts`; nothing outside this directory needs to change.
 */
const PROVIDERS: readonly FlightProvider[] = [amadeusProvider];

export function activeProvider(): FlightProvider | null {
  return PROVIDERS.find((p) => p.isConfigured()) ?? null;
}

/** True when real flight data is available, without making a request. */
export function isConfigured(): boolean {
  return PROVIDERS.some((p) => p.isConfigured());
}

export type { FlightLookup, FlightLookupQuery, FlightStatus, LookupFailure, LookupResult } from "./types.ts";
export { normaliseQuery } from "./types.ts";
export { resetTokenCache } from "./amadeus.ts";

/**
 * The single entry point.
 *
 * A caller never learns which provider answered, or that more than one exists.
 * With nothing configured this returns `not-configured` rather than throwing,
 * because the client's correct response to that is to fall back to the offline
 * resolver, and an exception would be a 500 instead.
 */
export async function lookupFlight(query: FlightLookupQuery): Promise<LookupResult> {
  const provider = activeProvider();
  if (!provider) return { ok: false, reason: { kind: "not-configured" } };
  return provider.lookup(query);
}
