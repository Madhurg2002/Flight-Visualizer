import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Email + password only.
 *
 * A password provider is deliberate here: verification email would need an
 * outbound email provider and an API key before anyone could try the app, and
 * a flight log is a personal, non-sensitive record until it is published.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
