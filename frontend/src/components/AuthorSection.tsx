import { motion } from "motion/react";
import {
  ArrowUpRight,
  AtSign,
  Github,
  GraduationCap,
  Mail,
  Phone,
  Sparkles,
} from "lucide-react";
import {
  AUTHOR,
  AUTHOR_ACHIEVEMENTS,
  AUTHOR_CREDENTIALS,
  AUTHOR_EMAIL,
  AUTHOR_EXPERIENCE,
  AUTHOR_LINKS,
  AUTHOR_PROJECTS,
  AUTHOR_STACK,
} from "../lib/site";
import { cn } from "@skytrace/ui";

/**
 * The about-and-contact block.
 *
 * Skytrace is a real project with a real author, so this is not a stock
 * "built by" line: it says who did it, what they work on, and how to reach
 * them. Rendered on the landing page, and reused compactly in the footer.
 */
export function AuthorSection() {
  return (
    <section id="author" className="scroll-mt-20 border-t border-paper-200 bg-paper-100/40">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          {/* ------------------------------------------------ left: who and what */}
          <div className="min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
            >
              <p className="font-mono text-[11px] font-medium tracking-[0.16em] text-chart-600 uppercase">
                The person behind it
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
                {AUTHOR.name}
              </h2>
              <p className="mt-2 text-[15px] text-ink-600">
                {AUTHOR.role} @ {AUTHOR.company} · {AUTHOR.location}
              </p>

              {/* The titles, as a wrap of small tags rather than a run-on list. */}
              <ul className="mt-4 flex flex-wrap gap-2">
                {AUTHOR.titles.map((title) => (
                  <li
                    key={title}
                    className="rounded-full border border-paper-300 bg-paper-100 px-2.5 py-1 text-[11px] text-ink-500"
                  >
                    {title}
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-500"
            >
              {AUTHOR.bio}
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-400"
            >
              {AUTHOR.focus}
            </motion.p>

            {/* ---------------------------------------------------- experience */}
            <div className="mt-10">
              <h3 className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink-400 uppercase">
                Experience
              </h3>
              <ol className="mt-4 space-y-4">
                {AUTHOR_EXPERIENCE.map((role) => (
                  <li key={`${role.org}-${role.period}`} className="flex gap-3.5">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-chart-600" />
                    <div>
                      <p className="text-sm font-medium text-ink-800">
                        {role.role}, {role.org}
                      </p>
                      <p className="tabular mt-0.5 text-[11px] text-ink-400">
                        {role.period}
                      </p>
                      <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-400">
                        {role.note}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* ------------------------------------------------- achievements */}
            <div className="mt-10">
              <h3 className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink-400 uppercase">
                Selected work
              </h3>
              <dl className="mt-4 grid gap-px overflow-hidden rounded-[14px] border border-paper-300 bg-paper-300 sm:grid-cols-2">
                {AUTHOR_ACHIEVEMENTS.map((item) => (
                  <div key={item.stat} className="bg-paper-100 p-4">
                    <dt className="tabular text-lg font-semibold text-chart-600">
                      {item.stat}
                    </dt>
                    <dd className="mt-1 text-[13px] leading-relaxed text-ink-500">
                      {item.text}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* ------------------------------------------ right: how to reach him */}
          <div className="min-w-0 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="panel p-5"
            >
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <AtSign className="size-4 text-chart-600" />
                Get in touch
              </h3>
              <ul className="mt-4 space-y-1">
                <ContactRow
                  icon={<Mail className="size-4" />}
                  label="Email"
                  value={AUTHOR_EMAIL.handle}
                  href={AUTHOR_EMAIL.href}
                />
                <ContactRow
                  icon={<Phone className="size-4" />}
                  label="Phone"
                  value={AUTHOR.phone}
                  href={`tel:${AUTHOR.phone.replace(/\s/g, "")}`}
                />
                {AUTHOR_LINKS.map((link) => (
                  <ContactRow
                    key={link.href}
                    icon={<SocialIcon href={link.href} />}
                    label={link.label}
                    value={link.handle}
                    href={link.href}
                  />
                ))}
              </ul>
              <a
                href={AUTHOR.portfolio}
                target="_blank"
                rel="noreferrer noopener"
                className="group mt-4 flex items-center justify-between rounded-lg border border-chart-600/30 bg-chart-600/10 px-3.5 py-2.5 text-[13px] font-medium text-chart-500 transition-colors hover:border-chart-600/60 hover:bg-chart-600/15"
              >
                Portfolio and full résumé
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </motion.div>

            {/* -------------------------------------------------------- stack */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: 0.14 }}
              className="panel p-5"
            >
              <h3 className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink-400 uppercase">
                Stack
              </h3>
              <dl className="mt-3.5 space-y-3.5">
                {AUTHOR_STACK.map((group) => (
                  <div key={group.group}>
                    <dt className="text-[11px] text-ink-400">{group.group}</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">
                      {group.items.map((item) => (
                        <span
                          key={item}
                          className="rounded-md border border-paper-300 bg-paper-100 px-2 py-0.5 text-[11px] text-ink-600"
                        >
                          {item}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </motion.div>

            {/* -------------------------------------------------- credentials */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="panel p-5"
            >
              <h3 className="flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.14em] text-ink-400 uppercase">
                <GraduationCap className="size-4 text-chart-600" />
                Education and honours
              </h3>
              <dl className="mt-3.5 space-y-3">
                {AUTHOR_CREDENTIALS.map((item) => (
                  <div key={item.label}>
                    <dt className="text-[11px] text-ink-400">{item.label}</dt>
                    <dd className="mt-0.5 text-[13px] leading-relaxed text-ink-600">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </div>
        </div>

        {/* -------------------------------------------------------- projects */}
        <div className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
              <Sparkles className="size-4 text-chart-600" />
              Other projects
            </h3>
            <a
              href={AUTHOR.github}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-center gap-1 text-[13px] text-chart-600 transition-colors hover:text-chart-500"
            >
              All repositories on GitHub
              <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          <ul className="mt-6 grid gap-px overflow-hidden rounded-[14px] border border-paper-300 bg-paper-300 sm:grid-cols-2 lg:grid-cols-4">
            {AUTHOR_PROJECTS.map((project) => (
              <li key={project.name} className="group bg-paper-100 p-5 transition-colors hover:bg-paper-200">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink-900">{project.name}</h4>
                  {project.href && (
                    <ArrowUpRight className="size-3.5 shrink-0 text-ink-400 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-chart-600" />
                  )}
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">
                  {project.blurb}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <li>
      <a
        href={href}
        target={href.startsWith("mailto:") || href.startsWith("tel:") ? undefined : "_blank"}
        rel="noreferrer noopener"
        className="group flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-paper-200"
      >
        <span className="text-ink-400 transition-colors group-hover:text-chart-600">
          {icon}
        </span>
        <span className="w-16 shrink-0 text-[11px] text-ink-400">{label}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-700 transition-colors group-hover:text-ink-900">
          {value}
        </span>
        <ArrowUpRight className="ml-auto size-3 shrink-0 text-ink-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
    </li>
  );
}

/**
 * The compact credit that sits in the site footer: a name, a one-line credit,
 * and the two links people actually reach for. Everything else lives in the
 * about section rather than being crammed into a footer.
 */
export function AuthorCredit() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div>
        <p className="text-sm font-medium text-ink-700">
          Built by{" "}
          <a
            href={AUTHOR.github}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-chart-600 transition-colors hover:text-chart-500"
          >
            {AUTHOR.name}
          </a>
        </p>
        <p className="mt-0.5 text-xs text-ink-400">
          {AUTHOR.role} @ {AUTHOR.company} ·{" "}
          <a
            href={AUTHOR_EMAIL.href}
            className="transition-colors hover:text-ink-500"
          >
            {AUTHOR_EMAIL.handle}
          </a>
        </p>
      </div>
      <div className="flex items-center gap-3 sm:ml-2">
        {AUTHOR_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            title={link.handle}
            className="text-ink-400 transition-colors hover:text-chart-600"
          >
            <SocialIcon href={link.href} />
          </a>
        ))}
        <a
          href={AUTHOR_EMAIL.href}
          title={AUTHOR_EMAIL.handle}
          className="text-ink-400 transition-colors hover:text-chart-600"
        >
          <Mail className="size-4" />
        </a>
      </div>
    </div>
  );
}

/** A wordmark per link, so the footer is not a row of identical icons. */
function SocialIcon({ href }: { href: string }) {
  if (href.includes("github")) return <Github className="size-4" />;
  if (href.includes("linkedin"))
    return (
      <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
        <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.31-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21h-4V9z" />
      </svg>
    );
  if (href.includes("leetcode"))
    return (
      <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
        <path d="M13.48 2.42a1.4 1.4 0 0 1 1.98 0l6.12 6.12a1.4 1.4 0 0 1 0 1.98l-6.12 6.12a1.4 1.4 0 0 1-1.98 0L7.4 10.56 5.02 12.94a.7.7 0 0 0 0 .99l2.38 2.38a.7.7 0 0 0 .99 0l1.5-1.5 2.38 2.38a1.4 1.4 0 0 1 0 1.98l-2.38 2.38a2.8 2.8 0 0 1-3.96 0L1.93 14.48a2.8 2.8 0 0 1 0-3.96L11.52 2.42z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.6 15.6 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14A7.8 7.8 0 0 1 4 12c0-.7.1-1.36.26-2h3.38a16.5 16.5 0 0 0 0 4H4.26zm.82 2h2.95c.32 1.28.78 2.5 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.6 15.6 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82A13.7 13.7 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.26 5.56c.6-1.06 1.06-2.28 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38c.16.64.26 1.3.26 2 0 .7-.1 1.36-.26 2h-3.38z" />
    </svg>
  );
}

/** A compact line used in the app shell, linking back to the about section. */
export function AuthorByline({ className }: { className?: string }) {
  return (
    <a
      href={AUTHOR.github}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "text-ink-400 transition-colors hover:text-chart-600",
        className,
      )}
    >
      {AUTHOR.name}
    </a>
  );
}
