import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@skytrace/ui";
import { AlertTriangle } from "lucide-react";

type Props = {
  children: ReactNode;
  /**
   * Called when the boundary catches. Lets the page clear stale state, e.g.
   * drop a selection pointing at a flight the map never managed to draw.
   */
  onError?: (error: Error) => void;
};

type State = { error: Error | null };

/**
 * Keeps a map failure inside the map.
 *
 * The map is a lazily-imported chunk rendered with no boundary of its own, so
 * anything that goes wrong inside it — the chunk failing to fetch after a
 * redeploy, a WebGL context that cannot be created, a provider that never
 * answers — used to throw during render and take the whole dashboard with it.
 * The failure is not recoverable by retrying in place, so the honest response
 * is to say what happened and offer the one thing that does help: a reload,
 * which picks up a chunk hash that has gone stale.
 */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[map] failed to render", error, info.componentStack);
    this.props.onError?.(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="graticule flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid size-12 place-items-center rounded-2xl border border-paper-300 bg-paper-100">
          <AlertTriangle className="size-5 text-chart-600" />
        </div>
        <p className="max-w-sm text-sm text-ink-600">
          The map could not be drawn. Your flights are safe — this is a display
          problem, not a data one.
        </p>
        <p className="max-w-sm text-xs text-ink-400">
          If the map was working a moment ago, reloading usually clears it. If
          not, your browser may have WebGL disabled, which the map needs.
        </p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
