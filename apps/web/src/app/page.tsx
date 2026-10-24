import Link from 'next/link';

import { QUIZ_HREF, TOOLS } from '@/features/tools/tools';
import { messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';

const t = messages.home;

export const metadata = pageMetadata({
  title: messages.meta.title,
  description: messages.meta.description,
  path: '/',
});

export default function Home() {
  return (
    <main className="flex flex-col">
      {/* Hero: dark with Volt; the rest of the page is light. */}
      <div className="theme-dark bg-background text-foreground">
        <section className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-12 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="flex flex-col gap-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t.hero.eyebrow}
            </p>
            <h1 className="text-2xl leading-tight sm:text-3xl">{t.hero.title}</h1>
            <p className="text-lg leading-relaxed text-muted">{t.hero.lead}</p>
          </div>
          <StartCard />
        </section>
      </div>

      <section aria-labelledby="usps" className="bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14">
          <h2 id="usps" className="text-xl">
            {t.usps.title}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.usps.items.map((usp) => (
              <li key={usp.title} className="flex flex-col gap-2 rounded-2xl bg-background p-5">
                <h3 className="text-lg font-semibold">{usp.title}</h3>
                <p className="leading-relaxed text-muted">{usp.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="how"
        className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14"
      >
        <h2 id="how" className="text-xl">
          {t.how.title}
        </h2>
        <ol className="grid gap-6 sm:grid-cols-3">
          {t.how.steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-surface font-semibold tabular-nums"
              >
                {index + 1}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="tools" className="bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-14">
          <div className="flex flex-col gap-2">
            <h2 id="tools" className="text-xl">
              {t.toolsTeaser.title}
            </h2>
            <p className="text-lg text-muted">{t.toolsTeaser.body}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((tool) => (
              <li key={tool.key}>
                <Link
                  href={tool.href}
                  className="flex h-full flex-col gap-1 rounded-2xl bg-background p-5 transition-colors hover:bg-surface-2"
                >
                  <span className="font-semibold">{messages.tools[tool.key].title}</span>
                  <span className="text-sm text-muted">{messages.tools[tool.key].description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

/** The page's one primary action: into the quiz funnel. */
function StartCard() {
  const c = t.start;
  return (
    <section
      aria-labelledby="start-title"
      className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 sm:p-8"
    >
      <h2 id="start-title" className="text-xl">
        {c.title}
      </h2>
      <p className="text-muted">{c.body}</p>
      <Link
        href={QUIZ_HREF}
        className="inline-flex min-h-12 items-center justify-center rounded-button bg-accent px-6 font-semibold text-on-accent transition-colors hover:bg-accent-pressed"
      >
        {c.button}
      </Link>
      <p className="text-sm text-muted">{c.trial}</p>
    </section>
  );
}
