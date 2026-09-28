import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@skytrace/ui";
import { LogIn, Plane, ShieldCheck } from "lucide-react";
import { Spinner } from "../lib/spinner";
import { ThemeToggle } from "../lib/theme";
import { SAMPLE_FLIGHTS } from "../lib/sampleFlights";
import { signInHref } from "../lib/auth";
import { BasemapPicker } from "../components/BasemapPicker";
import { MapErrorBoundary } from "../components/MapErrorBoundary";
import type { BasemapId, ColorMode } from "../components/FlightMap";

/**
 * deck.gl and MapLibre are ~1.9MB together, so the map stays a lazy chunk
 * here exactly as it is on the signed-in dashboard. The landing page shows
 * the same map, but holds it back until the browser is idle.
 */
const FlightMap = lazy(() =>
  import("../components/FlightMap").then((m) => ({ default: m.FlightMap })),
);

const signIn = signInHref("/dashboard");

/**
 * What a signed-out visitor gets.
 *
 * Seeing the product is the easy half: the map, the arcs, the playback and
 * the colour modes all work, drawn over a small illustrative log. Keeping a
 * history is the half that needs an account, and that is the only thing
 * sign-in is asked for here.
 *
 * The panels that would be meaningless without a session — statistics,
 * records, trips, add, import, export — are deliberately absent rather than
 * shown empty, so the page does not imply there is a log behind it.
 */
export function GuestDashboard() {
  const [basemap, setBasemap] = useState<BasemapId>("openfreemap-positron");
  const [colorMode, setColorMode] = useState<ColorMode>("year");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-paper-300 bg-paper-50 px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-sm border border-chart-600/45 bg-chart-600/10">
            <Plane className="size-3.5 -rotate-45 text-chart-600" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink-900">Skytrace</span>
          <span className="font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">
            flight log
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Public site</Link>
          </Button>
          <Button asChild size="sm">
            <Link to={signIn}>
              <LogIn />
              Sign in
            </Link>
          </Button>
        </div>
      </header>

      <div className="shrink-0 border-b border-paper-300 bg-chart-600/[0.06] px-4 py-2.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-600">
          <ShieldCheck className="size-3.5 shrink-0 text-chart-600" />
          <span>
            You are looking at a sample log, not your own. Everything here is
            drawn live — arcs, playback, colouring.
          </span>
          <span className="text-ink-400">
            Saving a flight and keeping its history needs an account.
          </span>
          <Button asChild size="sm" variant="outline" className="h-7">
            <Link to={signIn}>
              Create one — it is an email and a password
            </Link>
          </Button>
        </p>
      </div>

      <main className="grid min-h-0 flex-1 gap-2.5 bg-paper-50 p-2.5 lg:grid-cols-[1fr_300px]">
        <section className="panel relative min-h-[320px] overflow-hidden">
          <MapErrorBoundary>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-6" />
                </div>
              }
            >
              <FlightMap
                flights={SAMPLE_FLIGHTS}
                selectedId={selectedId}
                onSelect={setSelectedId}
                basemap={basemap}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
              />
            </Suspense>
          </MapErrorBoundary>
          <BasemapPicker value={basemap} onChange={setBasemap} />
        </section>

        <aside className="hidden min-h-0 space-y-2.5 overflow-y-auto lg:block">
          <div className="panel space-y-2.5 p-4">
            <h2 className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink-400 uppercase">
              What an account adds
            </h2>
            <ul className="space-y-2 text-[13px] text-ink-600">
              <li>Log a flight from anything you half-remember.</li>
              <li>Keep it — the log is yours, and it is still there next year.</li>
              <li>Group flights into trips and filter by them.</li>
              <li>Statistics, records and cost per kilometre over your own log.</li>
              <li>CSV import and export, whenever you want your data out.</li>
            </ul>
            <Button asChild size="sm" className="w-full">
              <Link to={signIn}>
                <LogIn />
                Sign in or create an account
              </Link>
            </Button>
            <p className="text-[11px] leading-relaxed text-ink-400">
              No verification email, no third-party account. An email address
              and a password is the whole thing.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
