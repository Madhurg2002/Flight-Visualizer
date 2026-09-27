import { Link } from "react-router-dom";
import { AuthorCredit, AuthorSection } from "../components/AuthorSection";
import { GlobeOrbit, type OrbitRoute } from "../components/GlobeOrbit";
import { ProductPreview } from "../components/ProductPreview";
import { ResolverDemo } from "../components/ResolverDemo";
import { useAuth } from "../lib/auth";
import { Button, cn } from "@skytrace/ui";
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
  Sparkles,
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
    <div className="min-h-screen scroll-smooth bg-ink-950">
      <header className="sticky top-0 z-50 border-b border-ink-800/80 bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">Skytrace</span>
          </Link>
          <nav className="flex items-center gap-2">
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
        {/* ------------------------------------------------------------ hero */}
        <section className="grain relative overflow-hidden">
          <div className="starfield absolute inset-0 opacity-70" aria-hidden />
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(70% 55% at 50% 0%, rgba(245,165,36,0.13), transparent 70%), radial-gradient(50% 40% at 82% 30%, rgba(45,212,191,0.10), transparent 70%)",
            }}
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850/80 px-3 py-1.5 text-xs text-haze-400"
              >
                <Sparkles className="size-3.5 text-signal-400" />
                No API keys, no sign-up wall to try it
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.05 }}
                className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-haze-50 sm:text-5xl lg:text-6xl"
              >
                Every flight you have ever taken,
                <span className="text-signal-fade block">drawn on one map.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.12 }}
                className="mt-5 max-w-xl text-balance text-[17px] leading-relaxed text-haze-400"
              >
                Log the flights you have flown and watch them accumulate into a map of your life.
                Type what you remember, and Skytrace works out which flight you meant.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.18 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Button asChild size="lg" variant="primary" className="glow-signal">
                  <Link to="/auth?mode=signUp">
                    <Plane />
                    Log your first flight
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#how">See how it works</a>
                </Button>
                <a
                  href="#author"
                  className="flex items-center gap-1.5 px-1 text-[13px] text-haze-500 transition-colors hover:text-signal-400"
                >
                  <User className="size-3.5" />
                  Who built this
                </a>
              </motion.div>

              <motion.dl
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-10 flex flex-wrap gap-x-8 gap-y-4"
              >
                {[
                  ["6,072", "airports indexed"],
                  ["52,450", "routes known"],
                  ["0", "API keys needed"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="tabular text-2xl font-semibold text-haze-50">{value}</dt>
                    <dd className="text-xs tracking-wide text-haze-500 uppercase">{label}</dd>
                  </div>
                ))}
              </motion.dl>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="relative flex justify-center"
            >
              <div
                className="absolute inset-0 -z-10 m-auto size-[70%] rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(245,165,36,0.18), transparent 70%)" }}
              />
              <GlobeOrbit routes={ORBITS} size={480} className="max-w-full" />
            </motion.div>
          </div>
        </section>

        {/* ------------------------------------------------------ the product */}
        <section className="relative overflow-hidden border-t border-ink-800">
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(60% 50% at 50% 0%, rgba(45,212,191,0.07), transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-5 py-16 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] text-signal-400 uppercase">
                  Your log
                </p>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-haze-50 sm:text-4xl">
                  It adds up to something.
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-haze-400">
                  Flights, countries, airports, distance, time aloft and carbon — all
                  computed from the real coordinates of the airports you actually went
                  between.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-haze-400">
                  {[
                    ["Arcs curve the way the aircraft flew", "Great-circle geometry on the sphere, not a decorative squiggle."],
                    ["Colour is the year", "A decade of travel, readable at a glance."],
                    ["Numbers are snapshotted", "A flight logged in 2019 still reads correctly today."],
                  ].map(([title, body]) => (
                    <li key={title} className="flex gap-3">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-signal-400" />
                      <span>
                        <span className="font-medium text-haze-200">{title}.</span> {body}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <ProductPreview className="edge-light" />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- live resolver */}
        <section className="border-y border-ink-800 bg-ink-900/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-signal-400 uppercase">
                Try it right now
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-haze-50 sm:text-4xl">
                It only knows you vaguely.
                <br />
                That is the point.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-haze-400">
                Nobody remembers flight numbers. Type a fragment below — this is the real
                resolver running against the real dataset, no sign-in required.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-haze-400">
                {[
                  "Aliases resolve: “United” and “UA” are the same airline.",
                  "Partial dates resolve: “March 2025” is understood, not rejected.",
                  "When it is unsure, it says so and offers options.",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-signal-400" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <ResolverDemo />
          </div>
        </section>

        {/* ------------------------------------------------------ how it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.12em] text-signal-400 uppercase">
              How it works
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-haze-50 sm:text-4xl">
              Three steps, then it is just your map.
            </h2>
          </div>

          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.step} className="panel relative p-6">
                <span className="tabular absolute top-4 right-5 text-3xl font-semibold text-ink-600">
                  {s.step}
                </span>
                <h3 className="mt-3 max-w-[80%] text-lg font-semibold text-haze-50">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-haze-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* --------------------------------------------------------- features */}
        <section className="border-t border-ink-800 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.12em] text-signal-400 uppercase">
                What is in the box
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-haze-50 sm:text-4xl">
                A log that actually adds something up.
              </h2>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-[14px] border border-ink-600 bg-ink-600 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <article
                  key={f.title}
                  className="group bg-ink-850 p-6 transition-colors hover:bg-ink-800"
                >
                  <f.icon className="size-5 text-signal-400 transition-transform duration-300 group-hover:scale-110" />
                  <h3 className="mt-4 font-semibold text-haze-50">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-haze-400">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- cta */}
        <section className="edge-light relative overflow-hidden border-t border-ink-800">
          <div className="grid-lines absolute inset-0 opacity-60" aria-hidden />
          <div className="relative mx-auto max-w-3xl px-5 py-20 text-center lg:py-28">
            <Globe2 className="mx-auto size-8 text-signal-400" />
            <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-haze-50 sm:text-4xl">
              Start with the flight you remember least clearly.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance text-[15px] text-haze-400">
              It is the one that proves the resolver works. Free to start, and your data stays
              yours.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="primary" className="glow-signal">
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

        {/* ---------------------------------------------------------- author */}
        <AuthorSection />
      </main>

      <Footer />
    </div>
  );
}

function Logo() {
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-lg border border-signal-400/40 bg-signal-400/10",
      )}
    >
      <Plane className="size-4 -rotate-45 text-signal-400" />
    </span>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-800">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-8 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-sm font-medium text-haze-200">Skytrace</span>
          </div>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-haze-600">
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
