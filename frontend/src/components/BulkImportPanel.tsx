import { useMutation } from "../lib/api";
import { useMemo, useRef, useState } from "react";
import { Button, Textarea, cn } from "@skytrace/ui";
import { CircleCheck, FileUp, ListPlus, TriangleAlert, Upload } from "lucide-react";
import { api } from "../lib/api";
import type { ImportRowResult } from "@skytrace/types";
import { formatDistance } from "@skytrace/flight-core";
import {
  downloadTextFile,
  flightsToCsv,
  parseCsv,
  type ParsedImportRow,
} from "../lib/csv";
import type { FlightLogWithAirports, Trip } from "@skytrace/types";

/**
 * Bulk import.
 *
 * A real flight log is hundreds of entries, and clicking Add hundreds of times
 * is not a workflow. This takes a paste or a spreadsheet and sends it in one
 * call, then shows exactly what happened to every line — including the ones
 * that were skipped, because an import that silently drops rows is worse than
 * no import at all.
 *
 * Resolution is the same resolver the search box uses, at `exact`/`high`
 * confidence only. Below that a single add would ask the user to choose, and
 * there is nobody to ask during a paste, so the line is reported instead.
 */

type Mode = "paste" | "csv";

const SAMPLE = `UA123 2025-03-14
SFO to JFK 2024-11-02
Delta to Rome, June 2025
BA 178 2023-07-21`;

export function BulkImportPanel({
  flights,
  trips,
  onImported,
}: {
  flights: FlightLogWithAirports[];
  trips: Trip[];
  onImported: () => void;
}) {
  const importBulk = useMutation(api.flights.importBulk);
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("paste");
  const [input, setInput] = useState("");
  const [tripId, setTripId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);

  async function runImport(rows: ParsedImportRow[]) {
    return await importBulk({
      rows,
      ...(tripId ? { tripId } : {}),
    });
  }

  // A paste is one flight per line; the resolver reads each line on its own.
  const pastedRows = useMemo<ParsedImportRow[]>(() =>
    input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ text })),
    [input],
  );

  const parsedCsv = useMemo(
    () => (mode === "csv" ? parseCsv(input) : null),
    [input, mode],
  );

  const rows = mode === "paste" ? pastedRows : (parsedCsv?.rows ?? []);
  const skipped = parsedCsv?.skipped ?? [];

  async function submit() {
    if (rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runImport(rows);
      setResults(result);
      onImported();
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^Error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setInput("");
    setResults(null);
    setError(null);
  }

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInput(String(reader.result ?? ""));
      setResults(null);
      setError(null);
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  const summary = useMemo(() => {
    if (!results) return null;
    const added = results.filter((row) => row.status === "added").length;
    const duplicate = results.filter((row) => row.status === "duplicate").length;
    const failed = results.filter(
      (row) => row.status === "unresolved" || row.status === "invalid",
    ).length;
    return { added, duplicate, failed };
  }, [results]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="panel flex w-full items-center gap-2 p-3 text-left text-[13px] text-ink-500 transition-colors hover:border-chart-600/50 hover:text-ink-700"
      >
        <ListPlus className="size-4 text-chart-600" />
        Import a list of flights
        <span className="ml-auto text-[11px] text-ink-400">paste or CSV</span>
      </button>
    );
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] font-medium tracking-[0.14em] text-ink-500 uppercase">
          Bulk import
        </h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-[11px] text-ink-400 transition-colors hover:text-ink-500"
        >
          Close
        </button>
      </div>

      <div className="mt-3 flex gap-1 rounded-lg border border-paper-300 bg-paper-100/60 p-0.5">
        {(
          [
            ["paste", "Paste lines", ListPlus],
            ["csv", "CSV file", FileUp],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setResults(null);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] transition-colors",
              mode === value
                ? "bg-chart-600/15 text-chart-600"
                : "text-ink-400 hover:text-ink-600",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === "csv" && (
        <div className="mt-3 flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onPickFile}
            className="hidden"
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload />
            Choose file
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              downloadTextFile(
                "skytrace-template.csv",
                flightsToCsv(flights.slice(0, 3)),
              )
            }
          >
            Download template
          </Button>
        </div>
      )}

      <Textarea
        value={input}
        onChange={(event) => {
          setInput(event.target.value);
          setResults(null);
        }}
        className="mt-3 min-h-32 font-mono text-[12px]"
        placeholder={
          mode === "paste"
            ? SAMPLE
            : "date,from,to,airline,flightNumber,cost,currency\n2025-03-14,SFO,JFK,UA,123,412.50,USD"
        }
        aria-label={mode === "paste" ? "One flight per line" : "CSV contents"}
      />

      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        {mode === "paste"
          ? "One flight per line. Anything the resolver understands works — codes, cities, airlines, or all three."
          : "Column names are matched loosely, so most spreadsheets import as-is. Unknown columns are ignored."}
      </p>

      {skipped.length > 0 && (
        <p className="mt-2 text-[11px] text-chart-600">
          {skipped.length} row{skipped.length === 1 ? "" : "s"} had no date, route or
          flight number and will be skipped.
        </p>
      )}

      {trips.length > 0 && (
        <div className="mt-3">
          <label
            htmlFor="import-trip"
            className="font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase"
          >
            Add everything to a trip
          </label>
          <select
            id="import-trip"
            value={tripId}
            onChange={(event) => setTripId(event.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-paper-300 bg-paper-100/80 px-2 text-[13px] text-ink-900"
          >
            <option value="">No trip</option>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={busy || rows.length === 0}
        >
          <Upload />
          {busy
            ? "Importing…"
            : `Import ${rows.length} flight${rows.length === 1 ? "" : "s"}`}
        </Button>
        {results && (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear
          </Button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-rust-600/30 bg-rust-600/10 px-3 py-2 text-[13px] text-rust-600"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {summary && results && (
        <div className="mt-3 rounded-lg border border-paper-300 bg-paper-100/60">
          <div className="flex flex-wrap items-center gap-3 border-b border-paper-300 px-3 py-2 text-[11px]">
            <span className="text-sky-600">
              <CircleCheck className="mr-1 inline size-3.5" />
              {summary.added} added
            </span>
            {summary.duplicate > 0 && (
              <span className="text-ink-400">{summary.duplicate} already in your log</span>
            )}
            {summary.failed > 0 && (
              <span className="text-chart-600">{summary.failed} need attention</span>
            )}
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {results.map((row) => (
              <li
                key={row.line}
                className={cn(
                  "flex items-start gap-2 border-b border-paper-200/70 px-3 py-2 text-[11px] last:border-0",
                  row.status === "unresolved" && "text-chart-600",
                  row.status === "invalid" && "text-rust-600",
                  row.status === "duplicate" && "text-ink-400",
                )}
              >
                <span className="tabular w-6 shrink-0 text-ink-400">{row.line}</span>
                <span className="min-w-0 flex-1">
                  {row.fromIata && row.toIata && (
                    <span className="tabular font-medium text-ink-700">
                      {row.fromIata} → {row.toIata}
                      {row.distanceKm !== null && (
                        <span className="ml-1.5 text-ink-400">
                          {formatDistance(row.distanceKm)}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="mt-0.5 block leading-relaxed text-ink-400">
                    {row.message || row.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
