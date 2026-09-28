import type { FlightLogWithAirports } from "@skytrace/types";
// The browser-safe barrel: geometry and emissions only. Importing the
// `/server` entry point here would pull the airport dataset in with it.
import { co2Kg, estimateDurationMin, haversineKm } from "@skytrace/flight-core";

/**
 * A small illustrative log, shown to signed-out visitors.
 *
 * The point is that someone arriving with no account should be able to see
 * what the map actually does — great-circle arcs, colour by year, playback —
 * before being asked for anything. Logging their own flights is what requires
 * an account, and keeping that history is the second half of the bargain.
 *
 * Coordinates are real, taken from the bundled airport dataset, so the arcs
 * land where they should. They are written out here rather than imported from
 * `@skytrace/data` on purpose: that package carries all 6,072 airports, and
 * importing it for twelve rows would put 1.2MB of dataset in the browser
 * bundle — the exact thing the CI bundle assertion exists to prevent. The
 * coordinates below were read from the generated data, not guessed.
 */
const AIRPORTS = {
  SFO: { name: "San Francisco International Airport", city: "San Francisco", country: "United States", lat: 37.619, lon: -122.375 },
  NRT: { name: "Narita International Airport", city: "Tokyo", country: "Japan", lat: 35.765, lon: 140.386 },
  SIN: { name: "Singapore Changi Airport", city: "Singapore", country: "Singapore", lat: 1.35, lon: 103.994 },
  LHR: { name: "London Heathrow Airport", city: "London", country: "United Kingdom", lat: 51.471, lon: -0.462 },
  JFK: { name: "John F Kennedy International Airport", city: "New York", country: "United States", lat: 40.64, lon: -73.779 },
  CDG: { name: "Charles de Gaulle International Airport", city: "Paris", country: "France", lat: 49.013, lon: 2.55 },
  DXB: { name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", lat: 25.253, lon: 55.364 },
  JNB: { name: "OR Tambo International Airport", city: "Johannesburg", country: "South Africa", lat: -26.139, lon: 28.246 },
  BOS: { name: "General Edward Lawrence Logan International Airport", city: "Boston", country: "United States", lat: 42.364, lon: -71.005 },
  LAX: { name: "Los Angeles International Airport", city: "Los Angeles", country: "United States", lat: 33.943, lon: -118.408 },
  FCO: { name: "Leonardo da Vinci–Fiumicino Airport", city: "Rome", country: "Italy", lat: 41.8, lon: 12.239 },
  BCN: { name: "Barcelona International Airport", city: "Barcelona", country: "Spain", lat: 41.297, lon: 2.078 },
} as const;

type Iata = keyof typeof AIRPORTS;

type Leg = {
  from: Iata;
  to: Iata;
  date: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  cabin: FlightLogWithAirports["cabin"];
};

/**
 * A plausible year of travel. Two years so the colour-by-year grouping has
 * something to separate, and a long enough spread that the map is not one
 * clump in the north Atlantic.
 */
const LEGS: Leg[] = [
  { from: "SFO", to: "NRT", date: "2025-03-14", airlineCode: "UA", airlineName: "United Airlines", flightNumber: "UA837", cabin: "economy" },
  { from: "NRT", to: "SIN", date: "2025-04-02", airlineCode: "SQ", airlineName: "Singapore Airlines", flightNumber: "SQ637", cabin: "economy" },
  { from: "SIN", to: "DXB", date: "2025-04-11", airlineCode: "EK", airlineName: "Emirates", flightNumber: "EK404", cabin: "business" },
  { from: "DXB", to: "LHR", date: "2025-04-12", airlineCode: "EK", airlineName: "Emirates", flightNumber: "EK002", cabin: "business" },
  { from: "LHR", to: "JFK", date: "2024-09-18", airlineCode: "BA", airlineName: "British Airways", flightNumber: "BA1517", cabin: "premium_economy" },
  { from: "CDG", to: "FCO", date: "2024-06-03", airlineCode: "AF", airlineName: "Air France", flightNumber: "AF1104", cabin: "economy" },
  { from: "FCO", to: "BCN", date: "2024-06-09", airlineCode: "VY", airlineName: "Vueling", flightNumber: "VY6211", cabin: "economy" },
  { from: "LAX", to: "SFO", date: "2025-01-21", airlineCode: "WN", airlineName: "Southwest", flightNumber: "WN3451", cabin: "economy" },
  { from: "BOS", to: "LHR", date: "2024-11-08", airlineCode: "BA", airlineName: "British Airways", flightNumber: "BA213", cabin: "business" },
  { from: "JNB", to: "LHR", date: "2025-02-27", airlineCode: "BA", airlineName: "British Airways", flightNumber: "BA55", cabin: "premium_economy" },
];

// A fixed timestamp: these are a static sample, and a moving one would make
// the "logged at" column meaningless. Any recent date is fine.
const LOGGED_AT = Date.UTC(2025, 4, 1);

export const SAMPLE_FLIGHTS: FlightLogWithAirports[] = LEGS.map((leg, index) => {
  const from = AIRPORTS[leg.from];
  const to = AIRPORTS[leg.to];
  // Computed with the same helpers the backend uses on save, so the sample
  // carries the real distance, block time and carbon figure rather than zeros
  // — otherwise the map would label every arc "0 km" and the distance and
  // carbon colour modes would have nothing to separate.
  const distanceKm = Math.round(haversineKm(from, to));
  return {
    id: `sample-${index}`,
    airlineCode: leg.airlineCode,
    airlineName: leg.airlineName,
    flightNumber: leg.flightNumber,
    flightDate: leg.date,
    fromIata: leg.from,
    toIata: leg.to,
    distanceKm,
    durationMin: estimateDurationMin(distanceKm),
    co2Kg: co2Kg(distanceKm, leg.cabin),
    aircraft: null,
    tailNumber: null,
    cabin: leg.cabin,
    seat: null,
    costMinor: null,
    currency: null,
    rating: null,
    notes: null,
    source: "manual",
    tripId: null,
    loggedAt: LOGGED_AT,
    fromLat: from.lat,
    fromLon: from.lon,
    toLat: to.lat,
    toLon: to.lon,
    fromName: from.name,
    toName: to.name,
    fromCity: from.city,
    toCity: to.city,
    countryOfOrigin: from.country,
    countryOfDest: to.country,
  };
});
