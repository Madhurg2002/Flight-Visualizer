import { useState } from "react";
import { cn } from "@skytrace/ui";
import { Layers } from "lucide-react";
import { BASEMAPS, getBasemap, type BasemapId } from "../lib/mapStyles";

/**
 * The basemap switcher that sits in the corner of the map.
 *
 * Extracted from the dashboard because the signed-out guest view has the same
 * map and therefore the same switcher — a guest is here to look at the arcs,
 * and the choice of basemap is part of looking.
 */
export function BasemapPicker({
  value,
  onChange,
}: {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = getBasemap(value);

  return (
    <div className="absolute top-2 right-2 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-paper-300 bg-paper-100/90 px-2.5 py-1.5 text-[11px] text-ink-700 backdrop-blur transition-colors hover:border-paper-400"
      >
        <Layers className="size-3.5" />
        {active.label}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close basemap menu"
            className="fixed inset-0 z-0 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute right-0 mt-1.5 w-64 overflow-hidden rounded-xl border border-paper-300 bg-paper-100/97 shadow-2xl backdrop-blur-xl">
            {BASEMAPS.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2.5 text-left transition-colors hover:bg-paper-200",
                    option.id === value && "bg-paper-200",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink-900">{option.label}</span>
                    <span className="text-[10px] text-ink-400">{option.provider}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-400">
                    {option.note}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
