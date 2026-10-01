import { HttpError, UserError, isIsoDate } from "../http.ts";
import {
  isConfigured,
  lookupFlight,
  normaliseQuery,
  activeProviderName,
  quotaExhausted,
} from "../flight-lookup/index.ts";
import { isFailure } from "../flight-lookup/types.ts";
import { requireUser, type Ctx } from "../session.ts";

/**
 * Look up a real flight.
 *
 * This is the one thing the compiled dataset cannot do: OpenFlights has routes
 * but no schedules, so "UA 1234" offline can only offer the carrier's hub
 * routes and ask. With a provider configured, it can say where the flight
 * actually went.
 *
 * Two deliberate choices:
 *
 * - **It is behind authentication.** The provider meters every call, and an
 *   unauthenticated endpoint that spends someone else's quota is an open tab
 *   with a metered API behind it. The other public routes read the compiled
 *   dataset, which costs nothing to serve.
 * - **"Not configured" is a success, not an error.** The app is designed to
 *   work with no key, and a client handed a 503 has nothing sensible to do
 *   with it. Answering `configured: false` lets the client fall back to the
 *   offline resolver, which is what it already does.
 */
export async function lookupFlightQuery(ctx: Ctx): Promise<unknown> {
  // The router resolves the user; it does not enforce anything. A metered
  // provider is exactly the kind of route that has to say so itself, because
  // the cost of being wrong is somebody else's quota.
  requireUser(ctx);

  const params = ctx.url.searchParams;
  const parsed = normaliseQuery(params.get("airline"), params.get("flightNumber"));
  if (!parsed) throw new UserError("Give a carrier and a number, like UA 1234.");

  const date = params.get("date");
  if (date !== null && date !== "" && !isIsoDate(date)) {
    throw new UserError("Give the date as yyyy-mm-dd, or leave it out.");
  }

  const result = await lookupFlight({ ...parsed, date: date || undefined });
  // The name comes from the provider rather than being written here, so a
  // swapped provider reports itself correctly instead of claiming to be the
  // one it replaced.
  if (!isFailure(result)) return { configured: true, provider: activeProviderName(), flight: result.flight };

  switch (result.reason.kind) {
    case "not-configured":
      return { configured: false, provider: null, flight: null };

    case "not-found":
      throw new UserError(
        date
          ? `No ${parsed.airline}${parsed.flightNumber} on ${date}. Try without the date.`
          : `No ${parsed.airline}${parsed.flightNumber} found. Try adding the date.`,
        404,
      );

    case "invalid":
      throw new UserError("That is not a flight the provider will answer.");

    case "provider-rejected":
      // The provider answered about a flight, but not one this app can use —
      // an airport it has no coordinates for. Saying so beats offering a
      // candidate that cannot be drawn on the map.
      throw new HttpError(422, "The provider returned a flight this app cannot place on a map.");

    case "quota-exhausted":
      // The plan expired or ran out of units. Nothing about the network is
      // wrong, so this must not borrow the outage's wording: "try again shortly"
      // would have somebody refreshing a button that cannot work until the
      // provider's account is paid for. It says which account, what is wrong and
      // what to do, and it is the same sentence the status endpoint offers
      // before anyone presses anything.
      throw new HttpError(result.reason.retryable ? 429 : 503, quotaMessage(result.reason.retryable));

    case "provider-unavailable":
      // 502, not 500: the failure is upstream, and a client that retries is
      // behaving correctly. A 500 would say the app itself is broken.
      throw new HttpError(502, "The flight data provider did not answer. Try again shortly.");
  }
}

/**
 * What the user is told when the key's allowance is spent.
 *
 * One sentence, used in both places it is needed — the failed lookup and the
 * status endpoint — because a message that appears only after the failure is a
 * message the user has already clicked once to earn.
 *
 * `retryable` is the difference the provider draws: a 429 is its rate window,
 * which closes by itself, and a 402 is the plan. Telling those two apart is the
 * whole point of carrying the flag rather than collapsing both into "no data".
 */
function quotaMessage(retryable: boolean): string {
  return retryable
    ? "Live flight lookup is rate limited right now — AeroDataBox is throttling this key. Try again in a moment; nothing else is affected."
    : "Live flight lookup is off: the AeroDataBox plan is expired or this month's API units are used up. Top up or renew the plan on aerodatabox.com to switch it back on. Everything else here works without it.";
}

/**
 * Whether the UI should offer the lookup at all. Costs no provider call.
 *
 * `unavailable` carries the reason when the provider has already refused this
 * key, so a panel can say why instead of rendering a button that is guaranteed
 * to fail. It is `null` in every other case, including the ordinary one where
 * no provider is configured at all.
 */
export function lookupStatus(ctx: Ctx): unknown {
  requireUser(ctx);
  const quota = quotaExhausted();
  return { configured: isConfigured(), unavailable: quota ? quotaMessage(quota.retryable) : null };
}
