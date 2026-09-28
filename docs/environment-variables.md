# Environment variables

Every environment variable Skytrace reads, what it is for, who sets it, and
what breaks when it is missing.

The short version: **the app needs no API keys and no accounts.** The aviation
data is compiled into the repository and the basemaps are keyless public tiles.
The only secrets anywhere in this project are the two signing keys that
Convex Auth needs in order to issue session tokens, and they exist because
sign-in exists — not because of any third-party service.

## At a glance

| Variable | Required? | Set by | Purpose |
| --- | --- | --- | --- |
| `CONVEX_DEPLOYMENT` | Yes, in dev | `convex dev` | Which deployment the CLI and client address |
| `CONVEX_URL` | Yes, in dev | `convex dev` | Where the backend lives; the Vite proxy target |
| `CONVEX_SITE_URL` | Yes | `convex dev` | Public origin of the app, used by the auth routes |
| `JWT_PRIVATE_KEY` | **Yes, for sign-in** | You | Signs session tokens |
| `JWKS` | **Yes, for sign-in** | You | The matching public key, so tokens can be verified |
| `VITE_CONVEX_URL` | No | You | Fallback backend address outside the browser |
| `SITE_URL` | No | You | Only for OAuth and magic links — unused here |

---

## The two keys you must supply

These are the only values in the project that a human has to create, and they
are the reason sign-in does not currently work in a fresh workspace.

| | |
| --- | --- |
| **`JWT_PRIVATE_KEY`** | The RSA private key that **signs** session tokens. Server-side only. |
| **`JWKS`** | The matching **public** key in JSON form, so a token can be **verified**. Safe to expose. |

They are a pair — one key, two representations. Generating them separately
produces a mismatch, and every sign-in then fails with an unhelpful signature
error.

### Why they exist

Convex Auth issues a signed token when a session is created, and verifies it on
every subsequent request. Signing needs a private key; verification needs the
public half. There is no sensible default, because a library cannot ship a key
that every deployment in the world shares — anyone holding it could mint a
session for any user of any deployment running that version.

### Generating them

```bash
npx @convex-dev/auth
```

This prints a matched `JWT_PRIVATE_KEY` and `JWKS` pair, ready to paste
together. It also creates `backend/convex/auth.config.ts` if it is missing —
see the note below.

### What happens without them

Nothing fails at build or start-up. The app boots, the landing page renders,
the resolver demo works signed out, and the map and flight log load normally.
The failure is deferred to the first sign-in attempt, which throws:

```
Uncaught Error: Missing environment variable `JWT_PRIVATE_KEY`
    at requireEnv (@convex-dev/auth/src/server/utils.ts:5:9)
    at generateToken (@convex-dev/auth/src/server/implementation/tokens.ts:25:18)
    at generateTokensForSession (...)
```

That stack is worth recognising: it is a **runtime** error in the Convex
function, not a compile error, so `bun run typecheck` and `bun run build` stay
green. Anything that needs a session — the dashboard, saving a flight, any
server-side write — cannot work until both keys are set.

### Where to put them

Add both under **Settings → Environment**. Do not commit them: `.gitignore`
already excludes `.env` and `.env.*`, and a private key that reaches a public
repository has to be treated as compromised and rotated.

---

## Variables `convex dev` writes for you

These are created automatically on first run and are **not** secrets. They
record which local deployment this checkout is talking to.

### `CONVEX_DEPLOYMENT`

The name of the deployment, e.g. `anonymous-backend:1234abcd`. The Convex CLI
and the generated client both use it to decide which backend to address. It is
how a project is bound to a deployment rather than a URL being hardcoded.

*If wrong or absent:* the CLI cannot tell which deployment to push to, and
`convex dev` fails or provisions a new one.

### `CONVEX_URL`

The backend's own address, e.g. `http://127.0.0.1:3212`. Convex picks the port
and keeps this in step — it is not safe to assume a fixed number.

This one has an unusual role in this project. A local deployment binds to
`127.0.0.1`, which the sandbox can reach but **the user's browser cannot**,
because the browser talks to the preview server over HTTPS. So Vite proxies
`/api` and `/.well-known` through to this address, and the browser always builds
its Convex client from `window.location.origin` instead.

`frontend/vite.config.ts` reads this value from the file `convex dev` writes,
**before** falling back to the shell environment and then to a hardcoded
`http://127.0.0.1:3210`. That ordering is deliberate: a proxy aimed at a
deployment that no longer exists looks exactly like a broken backend, and
reading the backend's own file is what stops the two halves drifting apart.

*If wrong or absent:* the fallback `3210` is used. If the real deployment is on
a different port, every query fails in the browser while working perfectly in
the terminal — a confusing split that is worth checking first when queries fail
in the browser but not on the command line.

### `CONVEX_SITE_URL`

The public origin of the app, e.g. the preview URL. The auth HTTP routes under
`/.well-known` and `/api/auth` use it to build the absolute URLs the browser
must follow.

*If wrong or absent:* sign-in redirects and the auth discovery document point
somewhere unreachable, even with both keys set.

> These three are written to `backend/.env.local` — the backend's own file, not
> a shared one. The frontend reads that file directly rather than requiring you
> to copy anything.

---

## Optional

### `VITE_CONVEX_URL`

Read in `frontend/src/lib/convex.ts`, and only on the **non-browser** branch:

```ts
const convexUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : import.meta.env.VITE_CONVEX_URL ?? "http://127.0.0.1:3210";
```

In a real browser the ternary short-circuits to `window.location.origin`, so
this is effectively a **server-side render / test** fallback. Leave it unset in
normal use; setting it has no effect on what a visitor's browser does.

The `VITE_` prefix is not decoration: Vite only exposes variables carrying it
to client code, and deliberately refuses to expose anything else. That is why
the app cannot read `JWT_PRIVATE_KEY` from the browser even in principle.

### `SITE_URL`

Used by Convex Auth for OAuth redirects and emailed magic links. Skytrace uses
**the password provider only**, so this is not needed and is not referenced
anywhere in the code. Listed here only so its absence does not look like an
oversight.

If Google or GitHub sign-in is added later — it is on the
[roadmap](roadmap.md#accounts-and-infrastructure) — this becomes required, and
`backend/convex/auth.config.ts` starts mattering.

---

## Not required, for the avoidance of doubt

| Thing you might expect a key for | Reality |
| --- | --- |
| Aviation data | Compiled into the repo from the public OpenFlights dataset |
| Basemap tiles | Keyless public tiles — see [map-tiles.md](map-tiles.md) |
| Geocoding / airport lookup | Resolved from the bundled dataset, no API |
| Flight status | Not shipped; needs no key because it does not exist yet |
| Email | No verification mail, so no email provider key |

---

## Production

Production variables are set separately from the local ones and are **not**
read from any `.env` file:

```bash
freebuff-deploy env list
freebuff-deploy env set '{"JWT_PRIVATE_KEY":"...","JWKS":"..."}'
freebuff-deploy env unset KEY
```

A production deploy needs:

| Variable | Why |
| --- | --- |
| `CONVEX_URL` | The **cloud** deployment's address. The local one points at `127.0.0.1` and is unreachable from outside. |
| `CONVEX_SITE_URL` | The deployed app's public origin |
| `JWT_PRIVATE_KEY` | Session signing |
| `JWKS` | Session verification |

`CONVEX_DEPLOYMENT` is not needed in production: there is no CLI pushing
functions, only a client querying a running deployment.

Until a cloud deployment is connected, a deployed build renders but cannot save
a flight, and its data does not survive a redeploy — a local deployment stores
everything on the machine it runs on. Connect one with
`bunx convex dev --configure`.

---

## A missing file worth knowing about

Convex Auth's manual setup calls for `backend/convex/auth.config.ts`, which
declares the site domain and application id the client should expect. **This
repository does not have one.** The other four setup steps are all present —
`http.ts` registers the auth routes, `auth.ts` initialises the provider,
`moduleResolution` is `bundler`, and `skipLibCheck` is on.

Consequence: password sign-in works once the two keys exist, but the config
the client reads for OAuth-style and magic-link flows has no source, so
anything relying on it would have nothing to read. `npx @convex-dev/auth`
generates this file along with the keys, and it should be committed.

---

## Checking what is set

Never print an env file — several of these values are secrets. To see which
keys exist, by name only:

```bash
freebuff-env list        # local, including every .env file
freebuff-deploy env list # production
```

## Related

- [getting-started.md](getting-started.md) — running it locally, and troubleshooting
- [architecture.md](architecture.md) — why the browser and the backend talk through a proxy
- [map-tiles.md](map-tiles.md) — the keyless providers, and why nothing here needs a map key
