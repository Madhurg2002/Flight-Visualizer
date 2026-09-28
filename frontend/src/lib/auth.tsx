import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { invalidateQueries } from "./api";

/**
 * Sign-in state, replacing Convex Auth.
 *
 * The exports are the same ones the app already used — `useAuth`,
 * `usePasswordAuth`, `useSignOut`, `signInHref` — so the header, the auth page
 * and the dashboard needed no changes. What is underneath is now an ordinary
 * session cookie: the browser holds a signed-in cookie set by the server on
 * `/api/auth/signin`, and `/api/users/me` says who it belongs to.
 *
 * There is no token in JavaScript and no token in `localStorage`, so an XSS
 * cannot read the session — the cookie is `HttpOnly` and the only thing this
 * file can do with it is ask the server who it belongs to.
 */

export type AuthMode = "signIn" | "signUp";

type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  email: string | null;
};

/**
 * `AuthProvider` is kept as a component for compatibility with `main.tsx`, but
 * it no longer has to provide anything: state lives in the hook below, keyed on
 * a module-level value so every consumer sees the same session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const listeners = new Set<() => void>();

const initial: AuthState = { isLoading: true, isAuthenticated: false, email: null };
let state: AuthState = initial;
let loaded = false;

function setState(next: AuthState): void {
  // Replace the object rather than mutate it: `useSyncExternalStore` compares
  // snapshots by identity, and a mutated one would never re-render.
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState(): AuthState {
  return state;
}

async function refresh(): Promise<AuthState> {
  try {
    const response = await fetch("/api/users/me", { credentials: "same-origin" });
    if (!response.ok) throw new Error(String(response.status));
    const email = (await response.json()) as string | null;
    const next: AuthState = {
      isLoading: false,
      isAuthenticated: email !== null,
      email,
    };
    // Only publish a change: this runs on every sign-in, sign-out and reload,
    // and re-rendering the tree when nothing moved is wasted work.
    if (
      next.isAuthenticated !== state.isAuthenticated ||
      next.email !== state.email ||
      next.isLoading !== state.isLoading
    ) {
      setState(next);
    }
    return state;
  } catch {
    // A network failure must not read as "signed out", because that would show
    // a sign-in form to somebody who is signed in. Loading ends either way so
    // the app is never stuck on a spinner.
    const next: AuthState = { isLoading: false, isAuthenticated: state.isAuthenticated, email: state.email };
    if (next.isAuthenticated !== state.isAuthenticated || state.isLoading) setState(next);
    return state;
  }
}

/**
 * Who is signed in.
 *
 * `isLoading` is true only for the first check after a page load, which is what
 * `App.tsx` uses to hold the dashboard spinner instead of flashing the guest
 * view at somebody who turns out to be signed in.
 */
export function useAuth(): AuthState {
  useEffect(() => {
    // Asked once per page load. The result is shared through `state`, so the
    // header, the dashboard and the auth page all settle together.
    if (!loaded) {
      loaded = true;
      void refresh();
    }
  }, []);

  return useSyncExternalStore(subscribe, getState, getState);
}

/**
 * Run the password flow.
 *
 * Sign-up and sign-in stay separate on purpose. The server reports a wrong
 * password and an existing account the same way, so quietly falling back from
 * one flow to the other would turn "wrong password" into a confusing "that
 * account already exists".
 */
export function usePasswordAuth() {
  return useCallback(async (mode: AuthMode, email: string, password: string) => {
    try {
      const response = await fetch(`/api/auth/${mode === "signUp" ? "signup" : "signin"}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        return {
          ok: false as const,
          error: payload?.error ?? "Something went wrong. Please try again.",
        };
      }

      // The cookie is set by the response above. Reading the identity back
      // republishes it to every `useAuth` caller, so the header and the
      // dashboard switch over without a reload.
      invalidateQueries();
      await refresh();
      return { ok: true as const };
    } catch {
      return { ok: false as const, error: "Could not reach the server. Please try again." };
    }
  }, []);
}

export function useSignOut() {
  return useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
    } catch {
      // Signing out locally is still the right thing to do: the cookie is the
      // server's to clear, but the UI should not get stuck signed in.
    }
    invalidateQueries();
    loaded = true;
    setState({ isLoading: false, isAuthenticated: false, email: null });
  }, []);
}

/**
 * Carries the intended destination across the sign-in redirect.
 *
 * The dashboard is reachable signed out — a visitor can see the map over a
 * sample log — so signing in is asked for at the point of saving rather than
 * on arrival. When it is asked for, `returnTo` goes in the query string and
 * `/auth` navigates there afterwards, so the user lands back where they were
 * rather than on the landing page.
 */
export function signInHref(path: string) {
  return `/auth?returnTo=${encodeURIComponent(path)}`;
}
