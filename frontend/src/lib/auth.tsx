import { ConvexAuthProvider, useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import type { ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { convex } from "./convex";

/** Wraps `ConvexReactClient` with Convex Auth so the whole tree can sign in. */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}

export function useAuth() {
  return useConvexAuth();
}

export type AuthMode = "signIn" | "signUp";

/**
 * Run one Convex Auth `Password` flow.
 *
 * Sign-up and sign-in stay separate on purpose. The provider reports a wrong
 * password and an existing account the same way, so quietly falling back from
 * one flow to the other would turn "wrong password" into a confusing "that
 * account already exists".
 */
export function usePasswordAuth() {
  const { signIn } = useAuthActions();

  return async (mode: AuthMode, email: string, password: string) => {
    try {
      const result = await signIn("password", {
        flow: mode,
        email: email.trim(),
        password,
      });
      // `signingIn` true means the flow completed without a redirect step.
      // With the password provider there is no email-verification hop, so this
      // is the only success signal there is.
      if (result.signingIn) return { ok: true as const };
      return {
        ok: false as const,
        error: "That did not complete. Please try again.",
      };
    } catch (error) {
      return { ok: false as const, error: humaniseAuthError(error, mode) };
    }
  };
}

export function useSignOut() {
  const { signOut } = useAuthActions();
  return () => signOut();
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

function humaniseAuthError(error: unknown, mode: AuthMode): string {
  const raw = error instanceof Error ? error.message : String(error);
  const isExistingAccount = /already exists|already registered|is taken/i.test(raw);
  const isBadCredentials = /invalid.*(email|password|credentials)|password.*incorrect/i.test(raw);
  const isWeakPassword = /password.*(8|eight|characters)/i.test(raw);

  if (mode === "signUp") {
    if (isExistingAccount) return "An account already exists for that email. Try signing in.";
    if (isWeakPassword) return "Pick a password of at least 8 characters.";
  }
  if (mode === "signIn" && isBadCredentials) {
    return "That email and password do not match an account.";
  }
  // Convex auth errors are prefixed with a server-generated code; the useful
  // part is the tail after the colon.
  const tail = raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1).trim() : raw;
  return tail || "Something went wrong. Please try again.";
}

export { api };
