import { useQuery } from "convex/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn, Input } from "@skytrace/ui";
import { Loader, Plane } from "lucide-react";
import { api } from "@convex/_generated/api";

/**
 * Airport autocomplete.
 *
 * The search runs on the server, because the airport table is ~1.2MB and the
 * browser is never a sensible place to hold it. A three-letter prefix is enough
 * to feel instant, and the free-text field stays fully editable so a user can
 * always just type the code.
 */

export type AirportSuggestion = {
  iata: string;
  icao: string | null;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  routes: number;
};

const DEBOUNCE_MS = 180;

export function AirportAutocomplete({
  value,
  onChange,
  label,
  id,
  className,
}: {
  value: string;
  /** Receives the IATA code once a suggestion is chosen. */
  onChange: (iata: string) => void;
  label: string;
  id?: string;
  className?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-suggestions`;

  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Bumping this is how a new keystroke invalidates the previous debounce.
  const [debounced, setDebounced] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Adopt changes that came from outside the input, e.g. the resolver picking a
  // candidate after the user searches in free text.
  useEffect(() => {
    setText(value);
    setDebounced(value);
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const shouldSearch = debounced.trim().length >= 2;
  const results = useQuery(
    api.airports.searchAirport,
    shouldSearch ? { query: debounced.trim(), limit: 7 } : "skip",
  );
  const searching = shouldSearch && results === undefined;

  const suggestions = useMemo(() => results ?? [], [results]);

  // Reset the highlighted row whenever the result set changes underneath it.
  useEffect(() => {
    setActive(0);
  }, [suggestions]);

  function choose(airport: AirportSuggestion) {
    onChange(airport.iata);
    setText(airport.iata);
    setDebounced(airport.iata);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      // Only intercept Enter when there is a highlighted row, so the form can
      // still be submitted normally.
      event.preventDefault();
      const picked = suggestions[active];
      if (picked) choose(picked);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Plane className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-haze-600" />
        <Input
          id={inputId}
          value={text}
          maxLength={40}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="City or code"
          onChange={(event) => {
            setText(event.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn("tabular pl-8 uppercase", className)}
        />
        {searching && (
          <Loader className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-haze-600" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink-600 bg-ink-850/98 py-1 shadow-2xl backdrop-blur-xl"
        >
          {suggestions.map((airport, index) => (
            <li key={airport.iata}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(airport)}
                className={cn(
                  "flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left transition-colors",
                  index === active ? "bg-signal-400/10" : "hover:bg-ink-800",
                )}
              >
                <span className="tabular w-9 shrink-0 text-[12px] font-semibold text-signal-400">
                  {airport.iata}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-haze-200">
                    {airport.city}
                    {airport.country ? `, ${airport.country}` : ""}
                  </span>
                  <span className="block truncate text-[10px] text-haze-600">
                    {airport.name}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !searching && suggestions.length === 0 && debounced.trim().length >= 2 && (
        <p className="absolute z-30 mt-1 w-full rounded-lg border border-dashed border-ink-600 bg-ink-850/98 px-2.5 py-2 text-[11px] text-haze-500">
          No airport matches “{debounced.trim()}”.
        </p>
      )}
    </div>
  );
}
