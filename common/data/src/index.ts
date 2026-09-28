/**
 * Static aviation reference data + lookups.
 *
 * `routes` is intentionally NOT re-exported here: it is 680KB and is only
 * needed by the backend resolver, so importing from the package index keeps it
 * out of the browser bundle.
 */
import { airports, type Airport } from "./airports.generated.ts";
import { airlines, type Airline } from "./airlines.generated.ts";

export type { Airport, Airline };
export { airports, airlines };

const airportByIata = new Map<string, Airport>(airports.map((a) => [a.iata.toUpperCase(), a]));

const airlineByCode = new Map<string, Airline>();
for (const a of airlines) {
  if (a.iata) airlineByCode.set(`iata:${a.iata.toUpperCase()}`, a);
  if (a.icao) airlineByCode.set(`icao:${a.icao.toUpperCase()}`, a);
}

export function getAirport(iata: string | null | undefined): Airport | null {
  if (!iata) return null;
  return airportByIata.get(iata.trim().toUpperCase()) ?? null;
}

export function getAirline(code: string | null | undefined): Airline | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return airlineByCode.get(`iata:${c}`) ?? airlineByCode.get(`icao:${c}`) ?? null;
}

/**
 * Rank airports for an autocomplete box. An exact IATA match always wins, then
 * city, then airport name, then country.
 */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const scored: { airport: Airport; score: number }[] = [];

  for (const a of airports) {
    let score = 0;
    if (a.iata === q) score = 1000;
    else if (a.city.toUpperCase().startsWith(q)) score = 500 - a.city.length;
    else if (a.city.toUpperCase().includes(q)) score = 300;
    else if (a.name.toUpperCase().startsWith(q)) score = 400 - a.name.length;
    else if (a.name.toUpperCase().includes(q)) score = 200;
    else if (a.country.toUpperCase().includes(q)) score = 100;
    else if (a.icao && a.icao.startsWith(q)) score = 600;
    // Break ties between same-named airports towards the bigger hub.
    if (score > 0) scored.push({ airport: a, score: score + Math.min(50, a.routes) });
  }

  scored.sort((x, y) => y.score - x.score || x.airport.iata.localeCompare(y.airport.iata));
  return scored.slice(0, limit).map((s) => s.airport);
}

/**
 * Rank airlines by code, name or callsign.
 *
 * Route count breaks ties between same-prefix names. Without it "United"
 * resolves to United Airways and "Delta" to Delta Aerotaxi, purely because
 * those names also start with the word the user typed.
 */
export function searchAirlines(query: string, limit = 8): Airline[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const scored: { airline: Airline; score: number }[] = [];
  for (const a of airlines) {
    let score = 0;
    if (a.iata === q) score = 1000;
    else if (a.icao === q) score = 900;
    else if (a.name.toUpperCase().startsWith(q)) score = 500;
    else if (a.name.toUpperCase().includes(q)) score = 300;
    else if (a.callsign && a.callsign.toUpperCase().startsWith(q)) score = 250;
    if (score > 0) {
      // Capped so a big operator cannot outrank an exact code or a stronger
      // textual match, only break ties within the same tier.
      scored.push({ airline: a, score: score + Math.min(400, a.routes) });
    }
  }
  scored.sort(
    (x, y) =>
      y.score - x.score ||
      // Prefer the mainline carrier over a same-prefix sibling: "Singapore
      // Airlines" rather than "Singapore Airlines Cargo".
      x.airline.name.length - y.airline.name.length ||
      x.airline.name.localeCompare(y.airline.name),
  );
  return scored.slice(0, limit).map((s) => s.airline);
}

/** Case- and punctuation-insensitive key used by the text name indexes. */
export function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Noise words stripped from airport names so "heathrow" finds
 * "London Heathrow Airport" and "schiphol" finds "Amsterdam Schiphol".
 */
const NAME_NOISE =
  /\b(airport|international|airfield|aerodrome|airbase|base|terminal|regional|field|force|memorial|municipal|metropolitan|county|state|afb|the|of)\b/g;

/** Words too generic to identify an airport on their own. */
const NAME_STOPWORDS = new Set([
  "north",
  "south",
  "east",
  "west",
  "central",
  "city",
  "town",
  "port",
  "new",
  "san",
  "santa",
]);

function airportNameKeys(airport: Airport): string[] {
  const city = normaliseName(airport.city);
  const name = normaliseName(airport.name);
  const stripped = normaliseName(airport.name.replace(NAME_NOISE, " "));

  const keys = new Set<string>();
  for (const key of [city, name, stripped]) if (key) keys.add(key);

  // The name minus the city, so "heathrow" finds "London Heathrow Airport".
  if (city && stripped.startsWith(city)) {
    const tail = stripped.slice(city.length).trim();
    if (tail) keys.add(tail);
  }

  // Individual distinctive words: people type "schiphol", "heathrow",
  // "stansted" rather than the full name.
  for (const word of stripped.split(" ")) {
    if (word.length >= 5 && !NAME_STOPWORDS.has(word)) keys.add(word);
  }

  return [...keys].filter(Boolean);
}

function buildAirportNameIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const byIata = new Map(airports.map((a) => [a.iata, a]));

  for (const airport of airports) {
    for (const key of airportNameKeys(airport)) {
      const bucket = index.get(key);
      if (bucket) {
        if (!bucket.includes(airport.iata)) bucket.push(airport.iata);
      } else {
        index.set(key, [airport.iata]);
      }
    }
  }

  // "London" is five airports and "New York" includes two heliports. Order
  // each bucket by how many scheduled routes the airport has, so the first
  // entry is the one a traveller almost certainly meant.
  for (const [key, bucket] of index) {
    bucket.sort((a, b) => {
      const ra = byIata.get(a)?.routes ?? 0;
      const rb = byIata.get(b)?.routes ?? 0;
      return rb - ra || a.localeCompare(b);
    });
    index.set(key, bucket);
  }

  return index;
}

function buildAirlineNameIndex(): Map<string, Airline[]> {
  const index = new Map<string, Airline[]>();
  for (const airline of airlines) {
    const key = normaliseName(airline.name);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(airline);
    else index.set(key, [airline]);
  }
  // Busiest carrier first, so an exact name match that several carriers share
  // resolves to the one a traveller means.
  for (const bucket of index.values()) bucket.sort((a, b) => b.routes - a.routes);
  return index;
}

let airportNameIndex: Map<string, string[]> | null = null;
let airlineNameIndex: Map<string, Airline[]> | null = null;

/**
 * Built lazily because the cost is only worth paying once someone actually
 * types free text, and most of the app never does.
 */
export function getAirportNameIndex(): Map<string, string[]> {
  airportNameIndex ??= buildAirportNameIndex();
  return airportNameIndex;
}

export function getAirlineNameIndex(): Map<string, Airline[]> {
  airlineNameIndex ??= buildAirlineNameIndex();
  return airlineNameIndex;
}
