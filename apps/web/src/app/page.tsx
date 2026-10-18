import Link from 'next/link';

import { WaitlistForm } from '@/features/waitlist/waitlist-form';
import { TOOLS } from '@/features/tools/tools';
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
      <section className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-12 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {t.hero.eyebrow}
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {t.hero.title}
          </h1>
          <p className="text-lg leading-relaxed text-muted">{t.hero.lead}</p>
        </div>
        <WaitlistCard />
      </section>

      <section aria-labelledby="usps" className="bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14">
          <h2 id="usps" className="text-3xl font-bold tracking-tight">
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
        <h2 id="how" className="text-3xl font-bold tracking-tight">
          {t.how.title}
        </h2>
        <ol className="grid gap-6 sm:grid-cols-3">
          {t.how.steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-primary font-bold text-on-primary"
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
            <h2 id="tools" className="text-3xl font-bold tracking-tight">
              {t.toolsTeaser.title}
            </h2>
            <p className="text-lg text-muted">{t.toolsTeaser.body}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((tool) => (
              <li key={tool.key}>
                <Link
                  href={tool.href}
                  className="flex h-full flex-col gap-1 rounded-2xl bg-background p-5 transition-colors hover:bg-surface-selected"
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

function WaitlistCard() {
  const w = messages.waitlist;
  return (
    <section
      id="waitlist"
      aria-labelledby="waitlist-title"
      className="flex scroll-mt-6 flex-col gap-4 rounded-3xl border border-border bg-background p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <h2 id="waitlist-title" className="text-2xl font-bold tracking-tight">
          {w.title}
        </h2>
        <p className="text-muted">{w.body}</p>
      </div>
      <WaitlistForm />
    </section>
  );
}
