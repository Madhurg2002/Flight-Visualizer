/**
 * Best-effort structured extraction from whatever the user typed.
 *
 * This is intentionally forgiving: the goal is to pre-fill a form and narrow
 * the resolver's search space, never to reject input. Anything we cannot
 * understand is left null and asked about in the UI.
 *
 * The approach is n-gram lookup rather than pattern matching. Users write
 * "United to Tokyo in March" — city names are not a fixed width, so any regex
 * keyed on a three-letter IATA code silently misses "Tokyo" and "London". We
 * build n-grams of up to four words out of the input and look each one up in
 * an index of real airport and airline names, which means the vocabulary comes
 * from the dataset instead of from a hand-written list.
 */
import {
  getAirline,
  getAirlineNameIndex,
  getAirport,
  getAirportNameIndex,
  normaliseName,
  searchAirlines,
  type Airport,
} from "@skytrace/data";

export type ParsedInput = {
  airlineCode: string | null;
  flightNumber: string | null;
  /** ISO `yyyy-mm-dd` when the user gave us a year, otherwise null. */
  date: string | null;
  /** Human echo of the date fragment, e.g. "14 March" — year still unknown. */
  dateHint: string | null;
  fromIata: string | null;
  toIata: string | null;
  /** Things we spotted that were not consumed, for the review step. */
  unrecognised: string[];
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
  sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/** Words that signal the next airport is the destination: "SFO to JFK". */
const TO_MARKERS = new Set([
  "to",
  "till",
  "until",
  "into",
  "then",
  "via",
  "for",
  "rightarrow",
  "arriving",
  "arrived",
  "landed",
]);

/** Words that signal the next airport is the origin: "flights from London". */
const FROM_MARKERS = new Set([
  "from",
  "out",
  "departing",
  "departed",
  "departure",
  "leaving",
  "leaving from",
  "originating",
  "origin",
]);

const MAX_NGRAM = 4;

/**
 * How many scheduled routes an airport needs before we will believe the user
 * meant that airport rather than a carrier of the same name.
 *
 * "Delta" is Delta Air Lines and also Delta Municipal Airport. The airport has
 * two routes in the reference dataset; the airline has nearly two thousand.
 * Comparing against a hub threshold gets that right without needing per-airport
 * special cases, and the UI always shows what was chosen.
 */
const SIGNIFICANT_HUB_ROUTES = 50;

function iso(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month, day));
  // Rejects overflow like 31 February, which Date would silently roll over.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) {
    return "";
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Pick a year for a month/day the user gave without one. Today is the sane
 * default: people logging flights are almost always logging recent ones, and a
 * flight dated later this month has not happened yet, so it means last year.
 */
function inferYear(month: number, day: number, now: Date): number {
  const currentYear = now.getUTCFullYear();
  const candidate = iso(currentYear, month, day);
  if (candidate) {
    const target = new Date(`${candidate}T00:00:00Z`).getTime();
    const tomorrow = now.getTime() + 24 * 60 * 60 * 1000;
    if (target <= tomorrow) return currentYear;
  }
  return currentYear - 1;
}

function parseDateFragment(text: string, now: Date): { date: string | null; hint: string | null } | null {
  // 2025-03-14 / 2025/03/14
  const isoMatch = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    const d = iso(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (d) return { date: d, hint: d };
  }

  // 3/14/2025 — only unambiguous with an explicit 4-digit year.
  const usMatch = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (usMatch) {
    const d = iso(Number(usMatch[3]), Number(usMatch[1]) - 1, Number(usMatch[2]));
    if (d) return { date: d, hint: d };
  }

  // "14 March 2025" / "14th March"
  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s*(\d{4})?\b/i);
  if (dayFirst && MONTHS[dayFirst[2]!.toLowerCase()] !== undefined) {
    const month = MONTHS[dayFirst[2]!.toLowerCase()]!;
    const day = Number(dayFirst[1]);
    const year = dayFirst[3] ? Number(dayFirst[3]) : inferYear(month, day, now);
    const d = iso(year, month, day);
    if (d) return { date: d, hint: dayFirst[0].trim() };
  }

  // "March 14, 2025" / "Mar 14". The day must be 1-2 digits so that the year in
  // "March 2025" is not read as a day.
  const monthFirst = text.match(
    /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?=[,.\s]|$)(?:,?\s*(\d{4}))?\b/i,
  );
  if (monthFirst && MONTHS[monthFirst[1]!.toLowerCase()] !== undefined) {
    const month = MONTHS[monthFirst[1]!.toLowerCase()]!;
    const day = Number(monthFirst[2]);
    if (day >= 1 && day <= 31) {
      const year = monthFirst[3] ? Number(monthFirst[3]) : inferYear(month, day, now);
      const d = iso(year, month, day);
      if (d) return { date: d, hint: monthFirst[0].trim() };
    }
  }

  // "March 2025" — a month and year but no day.
  const monthYear = text.match(/\b([a-z]{3,9})\.?\s+(\d{4})\b/i);
  if (monthYear && MONTHS[monthYear[1]!.toLowerCase()] !== undefined) {
    return { date: null, hint: monthYear[0].trim() };
  }

  return null;
}

type Token = { raw: string; norm: string };

/** Split on anything that is not a letter, digit or apostrophe. */
function tokenise(text: string): Token[] {
  return text
    .split(/[^\p{L}\p{N}']+/u)
    .filter((t) => t.length > 0)
    .map((raw) => ({ raw, norm: normaliseName(raw) }));
}

type Span = {
  start: number;
  end: number;
  kind: "airport" | "airline";
  /** IATA for airports, IATA-or-ICAO for airlines. */
  code: string;
  label: string;
};

/**
 * Airline designators are 2 letters/digits, sometimes 1: `UA123`, `W2 555`,
 * `9W11`. A flight number is what makes a two-letter token an airline rather
 * than an airport code.
 */
const DESIGNATOR = /\b([a-z]{2}|[a-z]\d|\d[a-z])\s?-?\s?(\d{1,4}[a-z]?)\b/gi;

export function parseFlightInput(raw: string, now: Date = new Date()): ParsedInput {
  const result: ParsedInput = {
    airlineCode: null,
    flightNumber: null,
    date: null,
    dateHint: null,
    fromIata: null,
    toIata: null,
    unrecognised: [],
  };

  let text = raw.trim();
  if (!text) return result;

  // 1. Date, before anything else, so its digits are not read as a flight number.
  const dateFragment = parseDateFragment(text, now);
  if (dateFragment) {
    result.date = dateFragment.date;
    result.dateHint = dateFragment.hint;
    if (dateFragment.hint) text = text.replace(dateFragment.hint, " ");
  }

  // 2. Explicit flight designator: strongest airline signal we can get.
  const spans: Span[] = [];

  for (const match of text.matchAll(DESIGNATOR)) {
    const airline = getAirline(match[1]!);
    if (!airline) continue;
    const code = airline.iata ?? airline.icao;
    if (!code) continue;
    result.airlineCode = code;
    result.flightNumber = match[2]!.toUpperCase();
    // Blank out the designator so it cannot also be read as an airport token.
    text = text.replace(match[0], " ".repeat(match[0].length));
    break;
  }

  // Re-tokenise after the date and designator have been blanked out.
  const live = tokenise(text);

  // 3. n-gram lookup against the real airport and airline vocabularies.
  const airportIndex = getAirportNameIndex();
  const airlineIndex = getAirlineNameIndex();

  for (let i = 0; i < live.length; i++) {
    for (let n = Math.min(MAX_NGRAM, live.length - i); n >= 1; n--) {
      const slice = live.slice(i, i + n);
      const phrase = slice.map((t) => t.norm).join(" ");
      if (!phrase) continue;

      // IATA/ICAO code beats a name of the same span: "SFO" is San Francisco,
      // not an airport whose city happens to be called Sfo.
      const single = slice.length === 1 ? slice[0]!.raw.toUpperCase() : null;
      if (single && /^[A-Z0-9]{3}$/.test(single)) {
        const airport = getAirport(single);
        if (airport) {
          spans.push({ start: i, end: i + n, kind: "airport", code: airport.iata, label: airport.name });
          i += n - 1;
          break;
        }
      }

      const airlineMatches = airlineIndex.get(phrase);
      if (airlineMatches && !result.airlineCode) {
        // A word can be both a town and a carrier: "Delta" is an airline and
        // also an airstrip in Colorado. If the airport has no scheduled routes
        // at all it is not somewhere anyone flew to, so the airline wins.
        // Otherwise the airport wins, because in a route query the place is
        // usually the thing being asked about.
        const airportMatches = airportIndex.get(phrase);
        const airport = airportMatches ? getAirport(airportMatches[0]!) : null;
        const preferAirline = airlineMatches.length > 0 && (!airport || airport.routes === 0);
        if (preferAirline) {
          const airline = airlineMatches[0]!;
          const code = airline.iata ?? airline.icao;
          if (code) {
            result.airlineCode = code;
            spans.push({ start: i, end: i + n, kind: "airline", code, label: airline.name });
            i += n - 1;
            break;
          }
        }
      }

      const airportMatches = airportIndex.get(phrase);
      if (airportMatches) {
        const airport = getAirport(airportMatches[0]!);

        // A single word can be an airport *and* the start of an airline's
        // name — "Delta" is both. If the airport is not a real hub, the
        // carrier is what was meant.
        if (airport && airport.routes < SIGNIFICANT_HUB_ROUTES && !result.airlineCode) {
          const byPrefix = searchAirlines(phrase, 1)[0];
          const code = byPrefix?.iata ?? byPrefix?.icao;
          if (code && (byPrefix?.routes ?? 0) > 0) {
            result.airlineCode = code;
            spans.push({ start: i, end: i + n, kind: "airline", code, label: byPrefix!.name });
            i += n - 1;
            break;
          }
        }

        if (airport) {
          spans.push({ start: i, end: i + n, kind: "airport", code: airport.iata, label: airport.name });
          i += n - 1;
          break;
        }
      }
    }
  }

  // Tokens already claimed as airports must not be re-read as airlines, unless
  // the airport they matched is somewhere nobody flies to. "Delta" is both
  // Delta Air Lines and a strip in Colorado; "JFK" is an airport and also an
  // operator's ICAO code.
  const airportByToken = new Map<number, Airport>();
  for (const s of spans) {
    if (s.kind !== "airport") continue;
    const airport = getAirport(s.code);
    if (airport) {
      for (let k = s.start; k < s.end; k++) airportByToken.set(k, airport);
    }
  }
  const claimed = new Set(airportByToken.keys());

  const free = live
    .map((t, index) => ({ t, index }))
    .filter(({ index }) => !claimed.has(index));

  // Words worth trying as an airline name: anything unclaimed, plus claimed
  // words whose airport is not a real hub.
  const airlineCandidates = live
    .map((_, index) => index)
    .filter((index) => {
      if (!claimed.has(index)) return true;
      return (airportByToken.get(index)?.routes ?? 0) < SIGNIFICANT_HUB_ROUTES;
    });

  // 4. Airline fallbacks. These run before direction is decided, because
  //    knowing the carrier is what disambiguates a lone airport name.

  // A bare two-letter airline code ("BA from London"), when no flight number
  // already told us the airline.
  //
  // Case-sensitive on purpose: airline codes are written uppercase, and
  // requiring it keeps ordinary words from being read as carriers. Without
  // this, "SFO to JFK" resolves the airline to TO (Transavia).
  if (!result.airlineCode) {
    for (const { t } of free) {
      if (t.raw.length !== 2 || !/^[A-Z]{2}$/.test(t.raw)) continue;
      const airline = getAirline(t.raw);
      if (airline?.iata) {
        result.airlineCode = airline.iata;
        break;
      }
    }
  }

  // Airline by partial name. "United" is not an airline's full name in the
  // dataset, so the exact-phrase index above misses it; fall back to prefix
  // ranking, longest phrase first.
  if (!result.airlineCode) {
    for (let n = Math.min(3, airlineCandidates.length); n >= 1; n--) {
      for (let start = 0; start + n <= airlineCandidates.length; start++) {
        const window = airlineCandidates.slice(start, start + n);
        // The words must be adjacent, or "to" would glue two airlines together.
        const adjacent = window.every((idx, k) => k === 0 || idx === window[k - 1]! + 1);
        if (!adjacent) continue;

        const phrase = window.map((i) => live[i]!.norm).join(" ");
        if (phrase.length < 3) continue;

        const matches = searchAirlines(phrase, 1);
        if (matches.length !== 1) continue;

        const airline = matches[0]!;
        // A carrier with no routes in the dataset is a defunct shell or a
        // private operator; it is never what someone means by a bare word.
        if (airline.routes === 0) continue;

        const code = airline.iata ?? airline.icao;
        if (!code) continue;
        result.airlineCode = code;
        break;
      }
      if (result.airlineCode) break;
    }
  }

  // 5. Direction. A "to"/"from" marker around an airport names it as the
  // destination or origin; otherwise fall back to order of appearance.
  const airportSpans = spans
    .filter((s) => s.kind === "airport")
    .sort((a, b) => a.start - b.start);

  const toMarkerIndex = live.findIndex((t) => TO_MARKERS.has(t.norm.toLowerCase()));
  const fromMarkerIndex = live.findIndex((t) => FROM_MARKERS.has(t.norm.toLowerCase()));

  if (airportSpans.length >= 2) {
    // Order of appearance is the default; an explicit marker between the two
    // airports confirms which end is which.
    const first = airportSpans[0]!;
    const second = airportSpans[1]!;
    const betweenTo = toMarkerIndex > first.start && toMarkerIndex < second.start;
    const betweenFrom = fromMarkerIndex > first.start && fromMarkerIndex < second.start;
    if (betweenFrom && !betweenTo) {
      result.fromIata = second.code;
      result.toIata = first.code;
    } else {
      result.fromIata = first.code;
      result.toIata = second.code;
    }
  } else if (airportSpans.length === 1) {
    const only = airportSpans[0]!;
    const toBefore = toMarkerIndex !== -1 && toMarkerIndex < only.start;
    const fromBefore = fromMarkerIndex !== -1 && fromMarkerIndex < only.start;
    const markerAfter =
      (toMarkerIndex !== -1 && toMarkerIndex > only.start) ||
      (fromMarkerIndex !== -1 && fromMarkerIndex > only.start);

    if (fromBefore) {
      // "flights from London"
      result.fromIata = only.code;
    } else if (toBefore) {
      // "United to Tokyo" — the city is where the flight was going.
      result.toIata = only.code;
    } else if (markerAfter) {
      // "SFO to Tokyo" — the code is the origin.
      result.fromIata = only.code;
    } else if (result.airlineCode) {
      // A route has two ends, so a lone airport named alongside an airline is
      // overwhelmingly the origin: "British Airways to London" is far rarer
      // than "…from London". Treating it that way is also what lets the
      // resolver suggest real routes.
      result.fromIata = only.code;
    } else {
      result.toIata = only.code;
    }
  }

  // Leftovers are noise words the review step can show the user.
  result.unrecognised = live
    .filter((t, index) => !claimed.has(index) && t.norm.length > 2)
    .map((t) => t.norm)
    .filter((word) => MONTHS[word] === undefined && !/^\d+$/.test(word));

  return result;
}
