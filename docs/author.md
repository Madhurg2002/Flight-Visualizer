# Author and contact

Skytrace is built by one person. This document is the prose version of
`frontend/src/lib/site.ts`, which is the actual source of truth — the landing
page About section, the site footer and the auth page all read from it, so
there is exactly one place to edit.

## Contact

| | |
| --- | --- |
| **Name** | Madhur Gupta |
| **GitHub** | [github.com/Madhurg2002](https://github.com/Madhurg2002) |
| **Email** | [madhurg2002@gmail.com](mailto:madhurg2002@gmail.com) |
| **Phone** | +91 90344 53365 |
| **LinkedIn** | [in/madhurg2002](https://linkedin.com/in/madhurg2002) |
| **LeetCode** | [leetcode.com/madhurg2002](https://leetcode.com/madhurg2002) |
| **Portfolio** | [portfolio-madhurg2002.vercel.app](https://portfolio-madhurg2002.vercel.app/) |

## Roles

Full Stack Developer, Geospatial Engineer, Backend Automation Specialist,
UI/UX Enthusiast.

| Role | Organisation | Period |
| --- | --- | --- |
| Full Stack Developer | Qen Labs | Feb 2024 — Present (remote) |
| Full Stack Intern | Professos | Jun 2023 — Aug 2023 |

At Qen Labs the work is geospatial and realtime systems: high-performance
rendering engines, tile pipelines, and the services behind them.

## Focus

Geospatial and realtime systems, and the automation that keeps a team shipping.
Currently learning Cloud Native Architecture and System Design, and open to
collaborating on open-source geospatial projects or new full-stack roles.

## Selected work

Each figure is a measured outcome rather than a description of effort.

| | |
| --- | --- |
| **1M+** | Point Kepler.gl / deck.gl engine with viewport-driven rendering, cutting memory use by 40% |
| **10+** | Layers of GeoJSON and H3 tile ingestion built into the same pipeline |
| **+30%** | Sprint velocity from agentic-Claude development workflows |
| **−30%** | Tech debt from centralised Redux state and reusable TypeScript hooks |
| **2×** | Deploy frequency after moving microservices to GCP Cloud Run with OAuth 2.0 |
| **50%** | Faster builds after Dockerising the pipeline |

## Stack

- **Frontend** — React, Next.js, TypeScript, Redux, deck.gl, Kepler.gl, Tailwind
- **Backend** — Node.js, Express, PostGIS, Socket.io, MongoDB
- **Infrastructure** — GCP Cloud Run, Docker, OAuth 2.0, Linux, Git
- **Languages** — TypeScript, JavaScript, Python, C++, C, Solidity

## Projects

Repositories are public on [GitHub](https://github.com/Madhurg2002).

- **Prometheus Query Gateway** — Fastify and React over PostgreSQL, with a
  Vitest suite over the query path.
- **Algorithm Visualizer & Multiplayer Platform** — Socket.io server with live
  shared visualisations of algorithms in flight.
- **DevCleaner** — Python CLI for finding and clearing out dead files and stale
  directories.
- **FinanceFlow** — personal finance tracking built around a clean, fast data
  model.
- **Professos** — full-stack platform shipped from an internship into a
  production codebase.
- **Discord Music Bot** — queue, playback and voice handling for a community
  music server.
- **Web3 Wave DApp** — Solidity contracts on Hardhat with a front end that
  survives a real network.
- **C++ Tic-Tac-Toe** — minimax with alpha-beta pruning.

## Education and honours

- **B.Tech, Electronics and Communication**, IIIT Kota, Dec 2020 – June 2024.
- **GATE Computer Science, 2024** — qualified.
- **MapYog — Intelligent Spatiotemporal Data Explorer** — co-author (2nd of 5).
  2nd ACM SIGSPATIAL Workshop on Advances in Urban-AI, pp. 58–61, 2024, with
  YogLabs AI Research Foundation and Qen Labs. Co-authors: Ankit Sharma, Mohd
  Junaid, Anuj Nandwana, Lokendra P. S. Chauhan.
- **Codeshastra 8.0** — geolocation-verified facial attendance prototype.
- 25–28 public repositories; 1000+ LeetCode and Codeforces problems solved.

## Changing these details

Edit `frontend/src/lib/site.ts` only. `AuthorSection.tsx` renders whatever is
there and does not hardcode any of it. If you add a social link, add it to
`AUTHOR_LINKS` and give it a `label` — the footer icons and the contact rows
both key off that array, and the icon is picked from the URL.
