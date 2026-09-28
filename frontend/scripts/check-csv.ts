/**
 * A quick harness for the CSV import path. Run with:
 *   bun run frontend/scripts/check-csv.ts
 */
import { flightsToCsv, normaliseDate, parseCsv } from "../src/lib/csv";
import type { FlightLogWithAirports } from "@skytrace/types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.error(`FAIL ${name}\n  expected ${b}\n  actual   ${a}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// --- dates ---------------------------------------------------------------
check("iso passthrough", normaliseDate("2025-03-14"), "2025-03-14");
check("slashes iso", normaliseDate("2025/03/14"), "2025-03-14");
check("day first unambiguous", normaliseDate("14/03/2025"), "2025-03-14");
check("day first ambiguous stays put", normaliseDate("03/04/2025"), "2025-04-03");
check("month first unambiguous", normaliseDate("03/25/2025"), "2025-03-25");
check("long form", normaliseDate("14 Mar 2025"), "2025-03-14");
check("garbage is rejected", normaliseDate("next tuesday"), undefined);
check("blank is undefined", normaliseDate(undefined), undefined);

// --- header mapping ------------------------------------------------------
const ourFormat = `date,from,to,airline,flightNumber,cabin,seat,aircraft,cost,currency,rating,trip,notes
2025-03-14,SFO,JFK,UA,123,business,14A,772,412.50,USD,5,Japan 2025,Great
2024-11-02,LHR,JFK,BA,178,economy,,,89.00,GBP,,,
`;
const ours = parseCsv(ourFormat);
check("our export: row count", ours.rows.length, 2);
check("our export: first route", [ours.rows[0]!.fromIata, ours.rows[0]!.toIata], ["SFO", "JFK"]);
check("our export: date", ours.rows[0]!.date, "2025-03-14");
check("our export: cost is minor units", ours.rows[0]!.costMinor, 41250);
check("our export: cabin", ours.rows[0]!.cabin, "business");
check("our export: second row cost", ours.rows[1]!.costMinor, 8900);
check("our export: currency upper-cased", ours.rows[1]!.currency, "GBP");
check("our export: nothing skipped", ours.skipped.length, 0);

// A hand-rolled sheet: different names, different order, quoted comma.
const handRolled = `Flight Number,Carrier,From,To,Departure Date,Class,Price
"1234, charter", UA, SFO, JFK, 14/03/2025, coach, 412.50
178, BA, LHR, JFK, 2024-11-02, Economy, 89`;
const rolled = parseCsv(handRolled);
check("hand-rolled: row count", rolled.rows.length, 2);
check("hand-rolled: quoted comma survives and is upper-cased", rolled.rows[0]!.flightNumber, "1234, CHARTER");
check("hand-rolled: date format", rolled.rows[0]!.date, "2025-03-14");
check("hand-rolled: coach means economy", rolled.rows[0]!.cabin, "economy");
check("hand-rolled: price", rolled.rows[0]!.costMinor, 41250);

// A sheet with no route columns at all: text only, resolved later.
const textOnly = `date,flightNumber
2025-03-14,1234
2025-04-01,88`;
const text = parseCsv(textOnly);
check("text only: no from", text.rows[0]!.fromIata, undefined);
check("text only: has text", text.rows[0]!.text.includes("1234"), true);

// Rows with a route but no date are kept, so the import can report "no date"
// against the exact line rather than the row vanishing. Only rows with nothing
// usable at all are dropped, and they are reported.
const junk = `date,from,to
,SFO,JFK
,,
2025-01-01,LHR,CDG`;
const parsedJunk = parseCsv(junk);
check("junk: dateless route is kept for review", parsedJunk.rows.length, 2);
check("junk: dateless route has no date", parsedJunk.rows[0]!.date, undefined);
check("junk: one skipped line", parsedJunk.skipped.length, 1);
check("junk: line number is right", parsedJunk.skipped[0]!.line, 3);

// --- round trip ----------------------------------------------------------
const flight = {
  id: "x",
  airlineCode: "UA",
  airlineName: "United Airlines",
  flightNumber: "123",
  flightDate: "2025-03-14",
  fromIata: "SFO",
  toIata: "JFK",
  distanceKm: 4150,
  durationMin: 330,
  co2Kg: 500,
  aircraft: "Boeing 777-200",
  tailNumber: null,
  cabin: "business",
  seat: "14A",
  costMinor: 41250,
  currency: "USD",
  rating: 5,
  notes: 'Window seat, "quiet" leg',
  source: "resolved",
  tripId: null,
  loggedAt: 0,
  fromLat: 37.6,
  fromLon: -122.4,
  toLat: 40.6,
  toLon: -73.7,
  fromName: "San Francisco International",
  toName: "John F Kennedy International",
  fromCity: "San Francisco",
  toCity: "New York",
  countryOfOrigin: "United States",
  countryOfDest: "United States",
} as unknown as FlightLogWithAirports;

const exported = flightsToCsv([flight]);
const reimported = parseCsv(exported);
check("round trip: row count", reimported.rows.length, 1);
check("round trip: route", [reimported.rows[0]!.fromIata, reimported.rows[0]!.toIata], ["SFO", "JFK"]);
check("round trip: notes with quotes survive", reimported.rows[0]!.notes, 'Window seat, "quiet" leg');
check("round trip: cost", reimported.rows[0]!.costMinor, 41250);
check("round trip: cabin", reimported.rows[0]!.cabin, "business");
check("round trip: rating", reimported.rows[0]!.rating, 5);
check("hand-rolled: rating out of ten is halved", rolled.rows[0]!.rating, undefined);

console.log(failures === 0 ? "\nall csv checks passed" : `\n${failures} check(s) failed`);
if (failures > 0) process.exit(1);
