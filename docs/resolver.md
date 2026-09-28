# The flight resolver

The feature the whole product rests on. A user typing "United to Tokyo in
March 2025" gives five fragments of information of wildly different quality, and
the resolver's job is to turn that into either one trustworthy answer or an
honest question.

**The governing rule: never confidently be wrong.** A flight log is only worth
anything if the routes on it are real.

## Where the code is

| Piece | File |
| --- | --- |
| Free-text → structured input | `common/flight-core/src/parse.ts` |
| Structured input → ranked candidates | `common/flight-core/src/resolve.ts` |
| Geography and emissions | `common/flight-core/src/geo.ts`, `emissions.ts` |
| Vocabulary lookups | `common/data/src/index.ts` |
| Convex entry point | `backend/convex/resolve.ts` |
| Test harness | `common/flight-core/scripts/parse-check.ts` |

Both halves are pure functions. `resolveFlight` takes a parse result plus its
dependencies and returns a `ResolveResult`. Nothing is imported from Convex or
React, which is why the harness can run it directly.

## Parsing: n-gram lookup, not patterns

The first implementation used regular expressions. It failed in an obvious way:
`"United to Tokyo in March 2025"` resolved to nothing, because a pattern keyed
on a three-letter IATA code can never match "Tokyo".

So parsing is now **vocabulary lookup**. The app builds indexes of every airport
city name, airport name and airline name, then generates n-grams of up to four
words from the input and looks each one up:

```
"united to tokyo in"
  4-gram  "united to tokyo in"   no match
  3-gram  "united to tokyo"      no match
  2-gram  "united to"            no match
  1-gram  "united"               no airline, no airport
...
"tokyo"                          → NRT
```

Longest match wins. The vocabulary comes from the dataset, so it covers
"Amsterdam Schiphol" and "Charles de Gaulle" without anyone writing them down.

### Why single words are indexed

People do not type full airport names. Indexing distinctive individual words
means `heathrow` finds "London Heathrow Airport", `schiphol` finds "Amsterdam
Schiphol", `stansted` finds "London Stansted". Generic words are filtered out
by length and a stopword list, and noise words are stripped from names first —
`London Heathrow Airport` is indexed as `heathrow` and not as
`international airport`.

### Order of operations

1. **Date first**, before anything else, so its digits are not read as a
   flight number.
2. **Explicit designator** — `UA 1234`, `W2 555`, `9W11`. The strongest airline
   signal available, and it requires a real carrier to match so that "top 10"
   is not a flight.
3. **n-gram lookup** over airports and airlines, longest first.
4. **Two-letter airline code** — "BA from London". Uppercase only, and that
   restriction matters: without it, `SFO to JFK` resolves the carrier to `TO`
   (Transavia) because the word "to" is two letters.
5. **Partial airline name** — "United" is not any carrier's full name in the
   dataset, so an exact-phrase miss falls back to prefix ranking, which is
   where route counts earn their keep (see [data-sources.md](data-sources.md)).
6. **Direction** — decided last, because knowing the carrier is what
   disambiguates a lone airport name.

## Ranking candidates

`resolveFlight` produces a sorted list of `FlightCandidate`, each carrying a
`confidence`, a `score` for ordering, and a `reason` that the UI shows verbatim.

| Confidence | When | What it means |
| --- | --- | --- |
| `exact` | Both airports, an airline and a date are all known | The flown path is certain |
| `high` | Both airports known | The route is certain; the airline or date is metadata |
| `medium` | An airline, or an airline plus one endpoint | A real route this carrier flies — the user picks |
| `low` | Nothing pinned down | Not surfaced |

The key insight in the table is that **both endpoints being known settles the
question**. If you said SFO to JFK, that is the route, whatever else is
missing. The airline and the date describe it; they cannot change it.

When only one endpoint or only an airline is known, the resolver falls back to
the 66,933-route table, narrowed by whatever was given, and filters to routes
where both ends are real hubs. Without that filter a bare "UA 1234" surfaces
Allentown–Chicago, because codeshares make obscure regional hops look
frequent.

Every candidate also reports what is still missing — `origin`, `destination`,
`airline`, `date` — so the UI can ask for exactly one more thing instead of
presenting an empty form.

## The limits, stated plainly

- **A flight number cannot be resolved to a route offline.** OpenFlights has
  routes, not schedules. Given "UA 1234" with no airports, the app offers the
  carrier's main routes and asks. Closing this needs a real-time flight API,
  designed for in [roadmap.md](roadmap.md).
- **Ambiguous cities resolve to the biggest airport, silently.** "London"
  becomes LHR. That is right most of the time and wrong the rest, and the
  result is always editable in the review form.
- **A month with no day cannot become a date.** "March 2025" is shown as a
  hint, not a date, and the form asks for the day.
- **Year inference guesses, and says nothing.** A month/day with no year is
  placed in the recent past, on the assumption that people log flights they
  have just taken. It is a guess, so it is visible and editable.

## Changing the resolver

Run the harness before and after:

```bash
bun run common/flight-core/scripts/parse-check.ts
```

It prints the parse and the top candidates for thirteen inputs, including the
ones that previously broke — "United to Tokyo in March 2025" (city name),
"BA from London" (bare code), "Delta to Rome" (airline that is also a town),
"qantas perth to heathrow" (suffix-stripped name) and "something random
gibberish zzz" (must resolve to nothing).

Add a case to the list when you fix a real input. A resolver regression is
silent — the app still renders, it is just quietly wrong — so the harness is
the only thing standing between a heuristic and a hallucination.
