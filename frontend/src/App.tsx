import { Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useQueryPolling } from "./lib/api";
import { Spinner } from "./lib/spinner";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GuestDashboard } from "./pages/GuestDashboard";
import { LandingPage } from "./pages/LandingPage";

/**
 * The dashboard is reachable signed out.
 *
 * Seeing the product is the free half: the map, the great-circle arcs, the
 * playback and the colouring all work over a sample log, and there is nothing
 * to sign up for to look. Keeping a history is the half that needs an
 * account, so that is the only thing sign-in is asked for.
 *
 * `RequireAuth` used to wrap this route and redirect anyone signed out to
 * `/auth`, which meant the map could not be seen at all without an account.
 */
function Dashboard() {
  const { isLoading, isAuthenticated } = useAuth();

  // While any query is mounted, the shared cache revalidates on an interval, so
  // a second tab converges on the same log.
  useQueryPolling();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-50">
        <Spinner />
      </div>
    );
  }

  return isAuthenticated ? <DashboardPage /> : <GuestDashboard />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
