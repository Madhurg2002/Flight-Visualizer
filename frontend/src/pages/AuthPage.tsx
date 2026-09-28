import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Label } from "@skytrace/ui";
import { ArrowLeft, Plane, TriangleAlert } from "lucide-react";
import { AuthorByline } from "../components/AuthorSection";
import { GlobeOrbit, type OrbitRoute } from "../components/GlobeOrbit";
import { useAuth, usePasswordAuth, type AuthMode } from "../lib/auth";
import { ThemeToggle } from "../lib/theme";
import { AUTHOR } from "../lib/site";

const ORBITS: OrbitRoute[] = [
  { from: { lat: 51.47, lon: -0.4543 }, to: { lat: 40.6413, lon: -73.7781 }, label: "LHR–JFK" },
  { from: { lat: 37.6188, lon: -122.3754 }, to: { lat: 35.772, lon: 140.3929 }, label: "SFO–NRT" },
  { from: { lat: -23.4356, lon: -46.4731 }, to: { lat: 49.0097, lon: 2.5479 }, label: "GRU–CDG" },
];

export function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const passwordAuth = usePasswordAuth();

  const [mode, setMode] = useState<AuthMode>(
    params.get("mode") === "signUp" ? "signUp" : "signIn",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Return the user to whatever they were trying to reach. Defaulting to the
  // dashboard matters: a signed-in user should never be sent back to the
  // landing page by a stale link.
  const returnTo = params.get("returnTo");

  useEffect(() => {
    if (isAuthenticated) navigate(returnTo ?? "/dashboard", { replace: true });
  }, [isAuthenticated, navigate, returnTo]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await passwordAuth(mode, email, password);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
    }
    // On success the effect above takes over the navigation.
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md border border-chart-600/40 bg-chart-600/10">
              <Plane className="size-4 -rotate-45 text-chart-600" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink-900">Skytrace</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              {mode === "signIn" ? "Welcome back" : "Start your flight log"}
            </h1>
            <p className="mt-2 text-sm text-ink-500">
              {mode === "signIn"
                ? "Sign in to pick up your map where you left it."
                : "An email and a password. That is the whole account."}
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signUp" ? "At least 8 characters" : "••••••••"}
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rust-600/30 bg-rust-600/10 px-3 py-2 text-[13px] text-rust-600"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                {busy ? "Just a moment…" : mode === "signIn" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-1.5 text-sm text-ink-400">
              {mode === "signIn" ? "No account yet?" : "Already have one?"}
              <button
                type="button"
                onClick={() => switchMode(mode === "signIn" ? "signUp" : "signIn")}
                className="font-medium text-chart-600 transition-colors hover:text-chart-500"
              >
                {mode === "signIn" ? "Create one" : "Sign in"}
              </button>
            </div>

            <Link
              to="/"
              className="mt-8 flex items-center justify-center gap-1.5 text-xs text-ink-400 transition-colors hover:text-ink-500"
            >
              <ArrowLeft className="size-3.5" />
              Back to the map
            </Link>

            <p className="mt-5 text-center text-[11px] text-ink-400">
              Built by{" "}
              <AuthorByline className="font-medium" /> ·{" "}
              <a
                href={AUTHOR.github}
                target="_blank"
                rel="noreferrer noopener"
                className="transition-colors hover:text-ink-500"
              >
                GitHub
              </a>
            </p>
          </div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-paper-200 bg-paper-100/40 lg:block">
        <div className="graticule absolute inset-0 opacity-60" aria-hidden />
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(60% 50% at 60% 40%, rgba(245,165,36,0.12), transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col items-center justify-center p-10">
          <GlobeOrbit routes={ORBITS} size={400} />
          <p className="mt-8 max-w-xs text-center text-balance text-sm leading-relaxed text-ink-500">
            Every arc is a flight you actually took, between two airports at their real
            coordinates.
          </p>
        </div>
      </aside>
    </div>
  );
}
