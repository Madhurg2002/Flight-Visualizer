/**
 * Convex Auth client configuration.
 *
 * Declares where the auth flows should send the browser. The domain is read
 * from `CONVEX_SITE_URL`, which `convex dev` writes into the backend's own env
 * file, so this cannot drift from the deployment the rest of the app is
 * pointed at.
 *
 * `applicationID` must be "convex" for the hosted auth to accept the tokens
 * this project issues.
 *
 * Only the password provider is used, so this file is not what signs anyone in
 * — `JWT_PRIVATE_KEY` and `JWKS` are. It is what tells the client which
 * application it is talking to, and it is the hook that OAuth and magic links
 * would be added through later.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
