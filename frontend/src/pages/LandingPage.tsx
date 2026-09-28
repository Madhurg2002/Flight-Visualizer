import { Link } from "react-router-dom";
import { AuthorCredit, AuthorSection } from "../components/AuthorSection";
import { GlobeOrbit, type OrbitRoute } from "../components/GlobeOrbit";
import { ProductPreview } from "../components/ProductPreview";
import { ResolverDemo } from "../components/ResolverDemo";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";
import { Button } from "@skytrace/ui";
import {
  ArrowRight,
  Coins,
  Globe2,
  History,
  Leaf,
  Map as MapIcon,
  Plane,
  Search,
  Share2,
  User,
} from "lucide-react";
import { motion } from "motion/react";

/** Real coordinates, so the globe is showing real routes rather than decoration. */
const ORBITS: OrbitRoute[] = [
  { from: { lat: 51.47, lon: -0.4543 }, to: { lat: 40.6413, lon: -73.7781 }, label: "LHR–JFK" },
  { from: { lat: 37.6188, lon: -122.3754 }, to: { lat: 35.772, lon: 140.3929 }, label: "SFO–NRT" },
  { from: { lat: 1.3644, lon: 103.9915 }, to: { lat: -33.9399, lon: 151.1753 }, label: "SIN–SYD" },
  { from: { lat: 25.2532, lon: 55.3657 }, to: { lat: 33.9416, lon: -118.4085 }, label: "DXB–LAX" },
  { from: { lat: -23.4356, lon: -46.4731 }, to: { lat: 49.0097, lon: 2.5479 }, label: "GRU–CDG" },
  { from: { lat: 28.5562, lon: 77.1 }, to: { lat: 25.2532, lon: 55.3657 }, label: "DEL–DXB" },
  { from: { lat: 19.4361, lon: -99.0719 }, to: { lat: -34.8222, lon: -58.5358 }, label: "MEX–EZE" },
  { from: { lat: -33.9715, lon: 18.6021 }, to: { lat: -26.1392, lon: 28.246 }, label: "CPT–JNB" },
];

/** The chart legend: the three numbers a reader checks before anything else. */
const LEGEND = [
  { value: "6,072", label: "airports indexed" },
  { value: "66,933", label: "routes known" },
  { value: "6,162", label: "carriers" },
  { value: "0", label: "API keys needed" },
];

const FEATURES = [
  {
    icon: Search,
    title: "Finds the flight from what you remember",
    body: "Half the flight number and a month. It searches, ranks and shows its reasoning — and asks you when it is not sure, instead of guessing.",
  },
  {
    icon: MapIcon,
    title: "Every flight drawn as a real route",
    body: "Great-circle arcs computed from actual airport coordinates, not a decorative squiggle. Long haul curves over the pole because it actually does.",
  },
  {
    icon: History,
    title: "History that does not rot",
    body: "Distance, duration and emissions are snapshotted onto your flight the moment you save it, so a log from years ago still reads correctly.",
  },
  {
    icon: Leaf,
    title: "Carbon, per flight and lifetime",
    body: "Cabin-class and short-haul aware estimates, totalled across everything you have flown.",
  },
  {
    icon: Coins,
    title: "Cost per kilometre",
    body: "Log fares and see what you actually paid to fly, per seat, per trip and per year.",
  },
  {
    icon: Share2,
    title: "A public log worth sharing",
    body: "Your map, your numbers, your colours. A link you would actually put in a bio.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Tell it what you remember",
    body: "Type it the way you would say it — “United to Tokyo in March”, “SFO to JFK, UA 1234”. Free text is fine.",
  },
  {
    step: "02",
    title: "Confirm, or pick",
    body: "The resolver narrows thousands of routes to a few and explains each one. You choose, or correct it yourself.",
  },
  {
    step: "03",
    title: "Watch the map fill in",
    body: "Your flight is stored as a route with real distance, duration and carbon, and the map redraws around it.",
  },
];

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen scroll-smooth bg-paper-50">
      {/* ------------------------------------------------------- masthead */}
      <header className="sticky top-0 z-50 border-b border-paper-300 bg-paper-50/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[15px] font-semibold tracking-tight text-ink-900">Skytrace</span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <a className="chart-link" href="#how">
              How it works
            </a>
            <a className="chart-link" href="#resolve">
              Try the resolver
            </a>
            <a className="chart-link" href="#author">
              Who built it
            </a>
          </nav>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button asChild variant="primary" size="sm">
                <Link to="/dashboard">
                  Open your log <ArrowRight />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <Link to="/auth?mode=signUp">Start logging</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* --------------------------------------------------------- hero */}
        <section className="grain relative overflow-hidden border-b border-paper-300">
          <div className="graticule absolute inset-0" aria-hidden />
          {/* A dashed boundary, the way a chart marks controlled airspace. */}
          <div
            className="pointer-events-none absolute -top-40 -right-40 size-[560px] rounded-full border border-dashed border-chart-600/25"
            aria-hidden
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
            <div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="eyebrow flex items-center gap-2"
              >
                <span className="inline-block h-px w-8 bg-chart-600" />
                Section 1 · Every flight on one plot
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.05 }}
                className="mt-5 text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.02em] text-ink-900 sm:text-5xl lg:text-[3.65rem]"
              >
                Every flight you have ever taken,
                <span className="text-chart-fade block">drawn on one map.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.12 }}
                className="mt-6 max-w-xl text-balance text-[17px] leading-relaxed text-ink-500"
              >
                Log the flights you have flown and watch them accumulate into a map of
                your life. Type what you remember, and Skytrace works out which flight
                you meant.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.18 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Button asChild size="lg" variant="primary">
                  <Link to="/auth?mode=signUp">
                    <Plane />
                    Log your first flight
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#how">See how it works</a>
                </Button>
                <a href="#author" className="chart-link">
                  <User className="size-3.5" />
                  Who built this
                </a>
              </motion.div>

              {/* The legend box. Ruled cells, not floating stat cards. */}
              <motion.dl
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-12 grid grid-cols-2 overflow-hidden rounded-md border border-paper-300 bg-paper-100 sm:grid-cols-4"
              >
                {LEGEND.map((item, i) => (
                  <div
                    key={item.label}
                    className={
                      "px-4 py-3 " +
                      (i % 2 === 1 ? "border-l border-paper-300 " : "") +
                      (i >= 2 ? "border-t border-paper-300 sm:border-t-0 " : "") +
                      (i === 2 ? "sm:border-l " : "")
                    }
                  >
                    <dt className="tabular text-xl font-semibold text-ink-900">
                      {item.value}
                    </dt>
                    <dd className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-ink-400 uppercase">
                      {item.label}
                    </dd>
                  </div>
                ))}
              </motion.dl>
            </div>

            {/* Plate 1: the globe, framed and captioned like a chart plate. */}
            <motion.figure
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="panel ticks relative mx-auto w-full max-w-[480px] p-6"
            >
              <GlobeOrbit routes={ORBITS} size={420} className="w-full" />
              <figcaption className="mt-4 flex items-baseline justify-between gap-3 border-t border-paper-300 pt-3">
                <span className="font-mono text-[10px] tracking-[0.14em] text-chart-600 uppercase">
                  Plate 1 — great-circle routes
                </span>
                <span className="font-mono text-[10px] text-ink-400">orthographic</span>
              </figcaption>
            </motion.figure>
          </div>
        </section>

        {/* ------------------------------------------------- the product */}
        <section className="border-b border-paper-300 bg-paper-100/45">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
              <div>
                <SectionHead index="02" title="Your log" line="It adds up to something." />
                <p className="mt-5 text-[15px] leading-relaxed text-ink-500">
                  Flights, countries, airports, distance, time aloft and carbon — all
                  computed from the real coordinates of the airports you actually went
                  between.
                </p>
                <dl className="mt-8 space-y-4">
                  {[
                    ["Arcs curve the way the aircraft flew", "Great-circle geometry on the sphere, not a decorative squiggle."],
                    ["Colour is the year", "A decade of travel, readable at a glance."],
                    ["Numbers are snapshotted", "A flight logged in 2019 still reads correctly today."],
                  ].map(([title, body]) => (
                    <div key={title} className="border-l-2 border-chart-600 pl-4">
                      <dt className="text-sm font-semibold text-ink-900">{title}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-ink-500">{body}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <ProductPreview className="ticks relative" />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ live resolver */}
        <section id="resolve" className="scroll-mt-16 border-b border-paper-300">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
            <div>
              <SectionHead
                index="03"
                title="Try it right now"
                line="It only knows you vaguely. That is the point."
              />
              <p className="mt-5 text-[15px] leading-relaxed text-ink-500">
                Nobody remembers flight numbers. Type a fragment below — this is the real
                resolver running against the real dataset, no sign-in required.
              </p>
              <ul className="mt-7 space-y-3 text-sm text-ink-500">
                {[
                  "Aliases resolve: “United” and “UA” are the same airline.",
                  "Partial dates resolve: “March 2025” is understood, not rejected.",
                  "When it is unsure, it says so and offers options.",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-[9px] size-1 shrink-0 bg-chart-600" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <ResolverDemo />
          </div>
        </section>

        {/* ---------------------------------------------- how it works */}
        <section
          id="how"
          className="scroll-mt-16 border-b border-paper-300 bg-paper-100/45"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
            <SectionHead index="04" title="How it works" line="Three steps, then it is just your map." />

            <ol className="mt-12 grid gap-px overflow-hidden rounded-md border border-paper-300 bg-paper-300 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.step} className="bg-paper-100 p-7">
                  <span className="tabular font-mono text-3xl font-medium text-chart-600">
                    {s.step}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink-900">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ----------------------------------------------------- features */}
        <section className="border-b border-paper-300">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
            <SectionHead index="05" title="What is in the box" line="A log that actually adds something up." />

            {/* A legend table, ruled rather than tiled. */}
            <div className="mt-12 border-t border-paper-300">
              {FEATURES.map((f, i) => (
                <article
                  key={f.title}
                  className="group grid gap-3 border-b border-paper-300 py-6 transition-colors hover:bg-paper-100/60 sm:grid-cols-[64px_1fr_1.3fr] sm:items-baseline sm:gap-6 sm:px-2"
                >
                  <span className="tabular font-mono text-xs text-chart-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="flex items-center gap-2.5 font-semibold text-ink-900">
                    <f.icon className="size-4 text-chart-600" />
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-ink-500">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- cta */}
        <section className="relative overflow-hidden bg-paper-100/45">
          <div className="graticule absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-3xl px-5 py-20 text-center lg:py-28">
            <Globe2 className="mx-auto size-7 text-chart-600" />
            <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Start with the flight you remember least clearly.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance text-[15px] text-ink-500">
              It is the one that proves the resolver works. Free to start, and your data
              stays yours.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="primary">
                <Link to="/auth?mode=signUp">
                  Create your log <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">I already have an account</Link>
              </Button>
            </div>
          </div>
        </section>

        <AuthorSection />
      </main>

      <Footer />
    </div>
  );
}

/** The chart mark: a magenta-outlined square with a heading aircraft. */
function Mark() {
  return (
    <span className="grid size-7 place-items-center rounded-sm border border-chart-600/45 bg-chart-600/10">
      <Plane className="size-3.5 -rotate-45 text-chart-600" />
    </span>
  );
}

/** The eyebrow + headline pair every section shares. */
function SectionHead({ index, title, line }: { index: string; title: string; line: string }) {
  return (
    <div>
      <p className="eyebrow flex items-center gap-2">
        <span className="inline-block h-px w-8 bg-chart-600" />
        {index} · {title}
      </p>
      <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
        {line}
      </h2>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-paper-300 bg-paper-50">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-8 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <Mark />
            <span className="text-sm font-semibold text-ink-900">Skytrace</span>
          </div>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-ink-400">
            Airport and route data from the OpenFlights public dataset. Basemaps by
            OpenFreeMap, CARTO and Esri. Emissions figures are estimates for your own
            comparison.
          </p>
        </div>
        <AuthorCredit />
      </div>
    </footer>
  );
}
