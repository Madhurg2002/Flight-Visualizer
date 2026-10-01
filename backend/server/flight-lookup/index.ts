import { aeroDataBoxProvider } from "./aero-databox.ts";
import type { FlightLookupQuery, FlightProvider, LookupResult } from "./types.ts";

/**
 * Which provider answers. Adding a second one is a line here and a new file
 * beside `aero-databox.ts`; nothing outside this directory needs to change.
 */
const PROVIDERS: readonly FlightProvider[] = [aeroDataBoxProvider];

export function activeProvider(): FlightProvider | null {
  return PROVIDERS.find((p) => p.isConfigured()) ?? null;
}

/**
 * The name of whichever provider is configured, or null if none is.
 *
 * Asked for separately rather than carried on the result so the route can
 * report it without either duplicating the lookup or hardcoding a name that
 * would go stale the next time the provider changes.
 */
export function activeProviderName(): string | null {
  return activeProvider()?.name ?? null;
}

/** True when real flight data is available, without making a request. */
export function isConfigured(): boolean {
  return PROVIDERS.some((p) => p.isConfigured());
}

export type { FlightLookup, FlightLookupQuery, FlightStatus, LookupFailure, LookupResult } from "./types.ts";
export { normaliseQuery } from "./types.ts";
export { quotaExhausted, resetLookupCache } from "./aero-databox.ts";

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
