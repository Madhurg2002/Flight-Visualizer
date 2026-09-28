/**
 * Exercises the resolver against a spread of free-text inputs.
 * Run: bun run common/flight-core/scripts/parse-check.ts
 *
 * The resolver is the part of this app most likely to break quietly, because
 * it has to survive whatever a person actually types. This prints the parse
 * and the top candidate for each case so regressions are visible at a glance.
 */
import { routeRows } from "../../data/src/routes.generated";
import { parseFlightInput, resolveFlight } from "../src/server";

const CASES = [
  "United to Tokyo in March 2025",
  "SFO to JFK",
  "BA from London on 2024-07-04",
  "UA 1234",
  "Emirates 203",
  "Delta to Rome",
  "flew Singapore to Sydney 3/14/2025",
  "AA 100 JFK to LHR 2023-11-02",
  "New York to London 14 March",
  "something random gibberish zzz",
  "qantas perth to heathrow",
  "I flew QF10 on 12 Jan 2019",
  "LHR",
];

for (const text of CASES) {
  const parsed = parseFlightInput(text);
  const result = resolveFlight(parsed, { routeRows });
  const top = result.candidates[0];
  console.log(`\n"${text}"`);
  console.log(
    `  airline=${parsed.airlineCode ?? "-"} fn=${parsed.flightNumber ?? "-"} date=${parsed.date ?? "-"} ` +
      `route=${parsed.fromIata ?? "-"}->${parsed.toIata ?? "-"}`,
  );
  console.log(`  missing=${result.missing.join(",") || "none"}`);
  for (const c of result.candidates.slice(0, 3)) {
    console.log(
      `   [${c.confidence}] ${c.fromIata}->${c.toIata} ${c.airlineName ?? "-"} ${c.distanceKm}km`,
    );
  }
  if (!top) console.log("   (no candidates)");
}
