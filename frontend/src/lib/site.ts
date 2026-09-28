/**
 * Single source of truth for who built Skytrace and how to reach them.
 *
 * Everything the UI shows about the author — the landing-page credit block, the
 * contact links, the docs — reads from here, so the contact details live in one
 * place instead of being copy-pasted into four components.
 */

export type SocialLink = {
  /** Display label, e.g. "GitHub". */
  label: string;
  /** The address shown next to the label, e.g. `in/madhurg2002`. */
  handle: string;
  href: string;
};

export const AUTHOR = {
  name: "Madhur Gupta",
  /** How he describes himself, used verbatim in the about block. */
  titles: [
    "Full Stack Developer",
    "Geospatial Engineer",
    "Backend Automation Specialist",
    "UI/UX Enthusiast",
  ],
  role: "Full Stack Developer",
  company: "Qen Labs",
  location: "India",
  bio: "I build geospatial and realtime systems that have to stay fast — 1M+ point Kepler.gl and deck.gl engines, tile pipelines, and the backends behind them. I like problems where the map is the interface and the data is real.",
  focus:
    "Geospatial and realtime systems, high-performance rendering engines, and the automation that keeps a team shipping. Currently learning Cloud Native Architecture and System Design, and open to collaborating on open-source geospatial work.",
  email: "madhurg2002@gmail.com",
  phone: "+91 90344 53365",
  github: "https://github.com/Madhurg2002",
  portfolio: "https://portfolio-madhurg2002.vercel.app/",
} as const;

/** Social and contact links, in the order they should render. */
export const AUTHOR_LINKS: SocialLink[] = [
  { label: "GitHub", handle: "github.com/Madhurg2002", href: AUTHOR.github },
  { label: "LinkedIn", handle: "in/madhurg2002", href: "https://linkedin.com/in/madhurg2002" },
  { label: "LeetCode", handle: "leetcode.com/madhurg2002", href: "https://leetcode.com/madhurg2002" },
  { label: "Portfolio", handle: "portfolio-madhurg2002.vercel.app", href: AUTHOR.portfolio },
];

export const AUTHOR_EMAIL: SocialLink = {
  label: "Email",
  handle: AUTHOR.email,
  href: `mailto:${AUTHOR.email}`,
};

export type Experience = {
  role: string;
  org: string;
  period: string;
  note: string;
};

/** Roles, most recent first. */
export const AUTHOR_EXPERIENCE: Experience[] = [
  {
    role: "Full Stack Developer",
    org: "Qen Labs",
    period: "Feb 2024 — Present",
    note: "Remote. Geospatial and realtime systems, high-performance rendering engines, and the services behind them.",
  },
  {
    role: "Full Stack Intern",
    org: "Professos",
    period: "Jun 2023 — Aug 2023",
    note: "Built and shipped features end to end, from schema to interface.",
  },
];

export type Achievement = {
  /** The number or short label that leads the row, e.g. "−40%" or "1M+". */
  stat: string;
  text: string;
};

/** Selected outcomes, each with the number that makes it checkable. */
export const AUTHOR_ACHIEVEMENTS: Achievement[] = [
  {
    stat: "1M+",
    text: "point Kepler.gl / deck.gl engine with viewport-driven rendering, cutting memory use by 40%",
  },
  {
    stat: "10+",
    text: "layers of GeoJSON and H3 tile ingestion built into the same pipeline",
  },
  {
    stat: "+30%",
    text: "sprint velocity from agentic-Claude development workflows",
  },
  {
    stat: "−30%",
    text: "tech debt from centralised Redux state and reusable TypeScript hooks",
  },
  {
    stat: "2×",
    text: "deploy frequency from moving microservices to GCP Cloud Run with OAuth 2.0",
  },
  {
    stat: "50%",
    text: "faster builds after Dockerising the pipeline",
  },
];

export type Project = {
  name: string;
  blurb: string;
  /** Omit for projects with no public repository. */
  href?: string;
};

/** Selected projects. Anything with a repository links straight to it. */
export const AUTHOR_PROJECTS: Project[] = [
  {
    name: "Prometheus Query Gateway",
    blurb: "Fastify and React over PostgreSQL, with a Vitest suite over the query path.",
    href: "https://github.com/Madhurg2002",
  },
  {
    name: "Algorithm Visualizer & Multiplayer Platform",
    blurb: "Socket.io server with live shared visualisations of algorithms in flight.",
    href: "https://github.com/Madhurg2002",
  },
  {
    name: "DevCleaner",
    blurb: "Python CLI for finding and clearing out dead files and stale directories.",
    href: "https://github.com/Madhurg2002",
  },
  {
    name: "FinanceFlow",
    blurb: "Personal finance tracking built around a clean, fast data model.",
    href: "https://github.com/Madhurg2002",
  },
  {
    name: "Professos",
    blurb: "Full-stack platform shipped from an internship into a production codebase.",
    href: "https://github.com/Madhurg2002",
  },
  {
    name: "Discord Music Bot",
    blurb: "Queue, playback and voice handling for a community music server.",
    href: "https://github.com/Madhurg2002",
  },
  {
    name: "Web3 Wave DApp",
    blurb: "Solidity contracts on Hardhat with a front end that survives a real network.",
    href: "https://github.com/Madhurg2002",
  },
  {
    name: "C++ Tic-Tac-Toe",
    blurb: "Minimax with alpha-beta pruning, written to be read as much as played.",
    href: "https://github.com/Madhurg2002",
  },
];

/** Where he studied and what came out of it. */
export const AUTHOR_CREDENTIALS: { label: string; value: string }[] = [
  {
    label: "Education",
    value: "B.Tech, Electronics and Communication — IIIT Kota, 2020 — 2024",
  },
  { label: "Qualified", value: "GATE Computer Science, 2024" },
  {
    label: "Published",
    value:
      "Co-author (2nd of 5), “MapYog — Intelligent Spatiotemporal Data Explorer”, 2nd ACM SIGSPATIAL Workshop on Advances in Urban-AI, pp. 58–61, 2024",
  },
  { label: "Open source", value: "25–28 public repositories" },
  { label: "Practice", value: "1000+ LeetCode and Codeforces problems" },
];

/** The stack, grouped so the UI can render it as columns rather than a blob. */
export const AUTHOR_STACK: { group: string; items: string[] }[] = [
  {
    group: "Frontend",
    items: ["React", "Next.js", "TypeScript", "Redux", "deck.gl", "Kepler.gl", "Tailwind"],
  },
  {
    group: "Backend",
    items: ["Node.js", "Express", "PostGIS", "Socket.io", "MongoDB", "REST"],
  },
  {
    group: "Infrastructure",
    items: ["GCP Cloud Run", "Docker", "OAuth 2.0", "CI/CD", "Linux", "Git"],
  },
  {
    group: "Languages",
    items: ["TypeScript", "JavaScript", "Python", "C++", "C", "Solidity"],
  },
];
