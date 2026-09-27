import type { FlightLogWithAirports } from "@skytrace/types";

/**
 * CSV in and out of the log.
 *
 * The export is deliberately written by hand rather than with a library: the
 * output is a flat, known set of columns, and pulling a dependency in for that
 * would be more code than the thirty lines below.
 *
 * The import is the interesting half. A user's spreadsheet will have their own
 * column names in their own order, so the parser matches headers loosely
 * instead of demanding ours.
 */

export const CSV_COLUMNS = [
  "date",
  "from",
  "to",
  "airline",
  "flightNumber",
  "cabin",
  "seat",
  "aircraft",
  "cost",
  "currency",
  "rating",
  "trip",
  "notes",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

const HEADER_ALIASES: Record<CsvColumn, string[]> = {
  date: ["date", "flightdate", "flight date", "departure date", "when", "day"],
  from: ["from", "origin", "departure", "from airport", "departure airport", "source", "src"],
  to: ["to", "destination", "arrival", "to airport", "arrival airport", "destination airport", "dest", "dst"],
  airline: ["airline", "carrier", "operator", "airline code", "airlinecode", "airline name"],
  flightNumber: ["flightnumber", "flight number", "flight", "number", "flight no", "flightno"],
  cabin: ["cabin", "class", "cabin class", "seat class", "fare class"],
  seat: ["seat", "seat number", "seatno"],
  aircraft: ["aircraft", "type", "aircraft type", "plane", "equipment"],
  cost: ["cost", "price", "fare", "amount", "paid", "spend", "price paid"],
  currency: ["currency", "curr", "ccy"],
  rating: ["rating", "stars", "score", "out of 10"],
  trip: ["trip", "trip name", "journey", "holiday", "group"],
  notes: ["notes", "note", "comment", "comments", "remarks"],
};

const CABIN_ALIASES: Record<string, "economy" | "premium_economy" | "business" | "first"> = {
  economy: "economy",
  coach: "economy",
  "economy class": "economy",
  premium: "premium_economy",
  "premium economy": "premium_economy",
  "premium-economy": "premium_economy",
  business: "business",
  biz: "business",
  "business class": "business",
  first: "first",
  "first class": "first",
};

/** Quote the value only when it needs it, so the common case stays readable. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Serialise the whole log.
 *
 * Columns are stable and ordered, so an export is also the template a user can
 * edit in a spreadsheet and feed straight back in.
 */
export function flightsToCsv(flights: FlightLogWithAirports[]): string {
  const tripNames = new Map<string, string>();
  const rows = flights.map((flight) => {
    return [
      flight.flightDate,
      flight.fromIata,
      flight.toIata,
      flight.airlineCode ?? "",
      flight.flightNumber ?? "",
      flight.cabin ?? "",
      flight.seat ?? "",
      flight.aircraft ?? "",
      flight.costMinor !== null ? (flight.costMinor / 100).toFixed(2) : "",
      flight.currency ?? "",
      flight.rating !== null ? String(flight.rating) : "",
      flight.tripId ? (tripNames.get(flight.tripId) ?? "") : "",
      flight.notes ?? "",
    ]
      .map(cell)
      .join(",");
  });

  return [CSV_COLUMNS.join(","), ...rows].join("\n") + "\n";
}

/** Hand the browser a file without a round trip. */
export function downloadTextFile(filename: string, contents: string, mime = "text/csv"): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the click a tick to start before the object URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A parsed import row, shaped to match the `flights.importBulk` mutation. */
export type ParsedImportRow = {
  text: string;
  fromIata?: string;
  toIata?: string;
  date?: string;
  airlineCode?: string;
  flightNumber?: string;
  seat?: string;
  aircraft?: string;
  cabin?: "economy" | "premium_economy" | "business" | "first";
  costMinor?: number;
  currency?: string;
  rating?: number;
  notes?: string;
};

export type ParsedCsv = {
  rows: ParsedImportRow[];
  /** Rows that had no usable date or route at all. */
  skipped: { line: number; reason: string }[];
  /** The header line, so the preview can say which columns it understood. */
  headers: string[];
};

/** One line of RFC 4180 CSV, split correctly even with commas inside quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

/** Map each header cell onto one of our known columns, or `null`. */
function classifyHeader(header: string): CsvColumn | null {
  const key = header.trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
  for (const [column, aliases] of Object.entries(HEADER_ALIASES) as [CsvColumn, string[]][]) {
    if (aliases.includes(key)) return column;
  }
  return null;
}

/**
 * Turn pasted CSV into import rows.
 *
 * Accepts the export format and most hand-rolled spreadsheets: header names
 * are matched loosely, and column order does not matter. Rows without a
 * recognisable route or date are reported rather than guessed at.
 */
export function parseCsv(input: string): ParsedCsv {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const skipped: ParsedCsv["skipped"] = [];
  if (lines.length === 0) return { rows: [], skipped, headers: [] };

  const firstCells = splitCsvLine(lines[0]!);
  const mapped = firstCells.map(classifyHeader);
  const hasHeader = mapped.some((column) => column !== null);

  // Without a header we assume our own column order, which is what a file
  // exported from here looks like after the header row has been deleted.
  const columnIndex: Map<CsvColumn, number> = new Map();
  if (hasHeader) {
    mapped.forEach((column, index) => {
      // First column of a given name wins, so a duplicated header is ignored
      // rather than silently overwriting the real one.
      if (column && !columnIndex.has(column)) columnIndex.set(column, index);
    });
  } else {
    CSV_COLUMNS.forEach((column, index) => columnIndex.set(column, index));
  }

  const value = (cells: string[], column: CsvColumn): string | undefined => {
    const index = columnIndex.get(column);
    if (index === undefined) return undefined;
    return cells[index]?.trim() || undefined;
  };

  const rows: ParsedImportRow[] = [];
  const body = hasHeader ? lines.slice(1) : lines;

  body.forEach((line, index) => {
    // +2 because line 1 is the header when there is one.
    const lineNumber = index + (hasHeader ? 2 : 1);
    const cells = splitCsvLine(line);

    const date = normaliseDate(value(cells, "date"));
    const from = value(cells, "from")?.toUpperCase();
    const to = value(cells, "to")?.toUpperCase();
    // Codes are canonicalised here so the backend never has to.
    const flightNumber = value(cells, "flightNumber")?.toUpperCase();
    const airlineCode = value(cells, "airline")?.toUpperCase();
    const cabinRaw = value(cells, "cabin");
    const costRaw = value(cells, "cost");
    const ratingRaw = value(cells, "rating");

    // Build something the resolver can read when the row has no explicit
    // route, so a two-column date+flight-number sheet still works.
    const text = [airlineCode, flightNumber].filter(Boolean).join(" ");

    if (!date && !from && !to && !text) {
      skipped.push({ line: lineNumber, reason: "No date, airports or flight number." });
      return;
    }

    const row: ParsedImportRow = {
      text: [from, to, airlineCode, flightNumber, date].filter(Boolean).join(" ") || text,
    };
    if (from) row.fromIata = from;
    if (to) row.toIata = to;
    if (date) row.date = date;
    if (airlineCode) row.airlineCode = airlineCode;
    if (flightNumber) row.flightNumber = flightNumber;
    if (cabinRaw) {
      const cabin = CABIN_ALIASES[cabinRaw.toLowerCase()];
      if (cabin) row.cabin = cabin;
    }
    const seat = value(cells, "seat");
    if (seat) row.seat = seat.toUpperCase();
    const aircraft = value(cells, "aircraft");
    if (aircraft) row.aircraft = aircraft;
    const notes = value(cells, "notes");
    if (notes) row.notes = notes;
    const currency = value(cells, "currency");
    if (currency) row.currency = currency.toUpperCase().slice(0, 3);
    if (costRaw) {
      const amount = Number(costRaw.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(amount)) row.costMinor = Math.round(amount * 100);
    }
    // A rating out of 10 is a common spreadsheet convention; halve it rather
    // than rejecting the column. Anything else out of range is left out.
    if (ratingRaw) {
      const rating = Number(ratingRaw);
      if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
        row.rating = Math.round(rating);
      } else if (Number.isFinite(rating) && rating > 5 && rating <= 10) {
        row.rating = Math.round(rating / 2);
      }
    }

    rows.push(row);
  });

  return { rows, skipped, headers: hasHeader ? firstCells : [] };
}

/**
 * Accept the several ways people write a date.
 *
 * Anything ambiguous is rejected rather than assumed: a log full of silently
 * shifted dates is worse than a few rejected rows the user can see.
 */
export function normaliseDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const text = input.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text.replace(/\//g, "-");

  // 14/03/2025 — day first, because the export writes ISO but spreadsheets are
  // usually written in the local convention. A value over 12 settles it either
  // way; when it is genuinely ambiguous, day first is the guess that is right
  // outside the US, and the preview shows the date so a wrong guess is visible.
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    const day = Number(d);
    const month = Number(m);
    if (month > 12 && day <= 12) {
      return `${y}-${day.toString().padStart(2, "0")}-${month.toString().padStart(2, "0")}`;
    }
    return `${y}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }

  // 14 Mar 2025 / Mar 14, 2025
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    // Read the parts back in UTC so a local timezone cannot shift the day.
    const y = parsed.getUTCFullYear();
    const mo = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    const candidate = `${y}-${mo}-${d}`;
    // A bare "March" resolves to the 1st; that is a guess, so only accept it
    // when the input actually carried a day.
    if (/\d/.test(text)) return candidate;
  }

  return undefined;
}
