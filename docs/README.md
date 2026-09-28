# Skytrace — documentation

Every document here is written to be read by someone who did not build it.
Start with the [project README](../README.md) for the short version; these are
the long ones.

| Document | What it answers |
| --- | --- |
| [getting-started.md](getting-started.md) | Running it locally, the scripts, CI, and troubleshooting |
| [environment-variables.md](environment-variables.md) | Every environment variable, what it is for, and what breaks without it |
| [capabilities.md](capabilities.md) | What the app can actually do today, feature by feature |
| [roadmap.md](roadmap.md) | What is finished, what is in progress, what is not started |
| [resolver.md](resolver.md) | How "United to Tokyo in March" becomes a specific flight |
| [architecture.md](architecture.md) | How the monorepo is laid out and why |
| [data-sources.md](data-sources.md) | Where the aviation data comes from and how to regenerate it |
| [map-tiles.md](map-tiles.md) | The free, keyless basemap providers and how to add one |
| [author.md](author.md) | Who built it and how to reach them |

## The short version

Skytrace is a personal flight log. You tell it a flight the way you would say
it out loud, it works out which flight you meant, and the flight draws itself
onto a world map.

Two constraints shaped nearly every decision:

1. **It must work with no API keys.** No account, no billing, nothing to
   configure. The aviation data is a static public dataset compiled into the
   repo, and the basemaps are keyless public tiles. See
   [data-sources.md](data-sources.md) and [map-tiles.md](map-tiles.md).
2. **It must never confidently be wrong.** A flight log is only useful if the
   routes on it are real. When the app is unsure it says so, shows its
   reasoning, and asks. See [resolver.md](resolver.md).
