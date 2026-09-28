import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@skytrace/ui";
import type { FlightLogWithAirports } from "@skytrace/types";
import { MapErrorBoundary } from "./MapErrorBoundary";
import { Spinner } from "../lib/spinner";

/**
 * deck.gl and MapLibre are ~1.9MB together. `React.lazy` keeps them out of the
 * page's own bundle, but on a hero — the one section guaranteed to be on
 * screen at first paint — that alone is not enough: the chunk would be
 * requested while the browser is still trying to render the words, competing
 * with them for bandwidth and for the main thread.
 *
 * So the import is gated twice. The observer is there for correctness if this
 * is ever moved below the fold, and the idle callback is what actually keeps
 * it off the critical path today: the headline, the copy and the calls to
 * action paint and become interactive first, and the map swaps in afterwards
 * over whatever `placeholder` was showing. The placeholder is not a spinner
 * over a hole — it is the previous plate, so the swap is a change of drawing
 * rather than the appearance of one.
 */
const FlightMap = lazy(() =>
  import("./FlightMap").then((m) => ({ default: m.FlightMap })),
);

type Props = {
  flights: FlightLogWithAirports[];
  /** Shown until the browser is idle, then left underneath the map. */
  placeholder: ReactNode;
  /** Restrict the map to this width of the viewport before fetching it. */
  rootMargin?: string;
  className?: string;
};

/**
 * `requestIdleCallback` is Chromium-only and absent from some test and
 * embedded browsers, so there is a timeout fallback. Without it the map would
 * never mount there at all, which is a worse failure than arriving late.
 */
type IdleWindow = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function LazyFlightMap({
  flights,
  placeholder,
  rootMargin = "200px",
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const win = window as unknown as IdleWindow;
    let idleHandle: number | undefined;
    let idleFallback: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;

    const requestIdle = (cb: () => void) => {
      if (win.requestIdleCallback) {
        idleHandle = win.requestIdleCallback(cb, { timeout: 1200 });
      } else {
        idleFallback = setTimeout(cb, 250);
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      // Nothing to observe against, so assume it is on screen and let the
      // idle gate do the deferral on its own.
      setInView(true);
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setInView(true);
            // Once it has been near the screen the map stays mounted. Leaving
            // it mounted on the way out would tear down a WebGL context and
            // rebuild it on the way back in, which costs more than keeping.
            observer?.disconnect();
          }
        },
        { rootMargin },
      );
      observer.observe(node);
    }

    requestIdle(() => setIdle(true));

    return () => {
      observer?.disconnect();
      if (idleHandle !== undefined) win.cancelIdleCallback?.(idleHandle);
      if (idleFallback !== undefined) clearTimeout(idleFallback);
    };
  }, [rootMargin]);

  const show = inView && idle;

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Kept in the tree underneath rather than swapped out, so the plate is
          still there behind the map canvas and nothing shifts on load. */}
      <div
        className={cn(
          "transition-opacity duration-700 ease-out",
          show ? "opacity-0" : "opacity-100",
        )}
        // The placeholder is decorative once the map covers it; hiding it
        // from assistive tech stops the two from being read as one image.
        aria-hidden={show}
      >
        {placeholder}
      </div>

      {show && (
        <div className="absolute inset-0">
          <MapErrorBoundary>
            <Suspense
              fallback={
                <div className="graticule flex h-full w-full items-center justify-center">
                  <Spinner className="size-6" />
                </div>
              }
            >
              <FlightMap
                flights={flights}
                selectedId={null}
                onSelect={() => {}}
                basemap="openfreemap-positron"
                colorMode="year"
              />
            </Suspense>
          </MapErrorBoundary>
        </div>
      )}
    </div>
  );
}
