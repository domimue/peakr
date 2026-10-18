import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { messages } from '@/i18n';

import { QUIZ_HREF, type ToolKey } from './tools';

export function toolMetadata(key: ToolKey): Metadata {
  const t = messages.tools[key];
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    openGraph: { title: t.metaTitle, description: t.metaDescription, type: 'website' },
  };
}

export function QuizCta() {
  const t = messages.cta;
  return (
    <aside className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
      <h2 className="text-xl font-semibold">{t.title}</h2>
      <p className="text-muted">{t.body}</p>
      <Link
        href={QUIZ_HREF}
        className="rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition-opacity hover:opacity-90"
      >
        {t.button}
      </Link>
    </aside>
  );
}

export interface ToolPageProps {
  toolKey: ToolKey;
  /** Static explanation shown above the calculator (e.g. the CSS test guide). */
  intro?: ReactNode;
  children: ReactNode;
}

/** Server-rendered frame of every calculator page: heading, calculator, SEO text and quiz CTA. */
export function ToolPage({ toolKey, intro, children }: ToolPageProps) {
  const t = messages.tools[toolKey];
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-lg text-muted">{t.lead}</p>
      </header>

      {intro}

      <section aria-label={t.title}>{children}</section>

      <QuizCta />

      <article className="flex flex-col gap-6">
        {t.seo.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{section.heading}</h2>
            <p className="leading-relaxed text-muted">{section.body}</p>
          </section>
        ))}
      </article>
    </main>
  );
}
