import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';

import { QUIZ_HREF, TOOLS, type ToolKey } from './tools';

export function toolMetadata(key: ToolKey): Metadata {
  const t = messages.tools[key];
  const href = TOOLS.find((tool) => tool.key === key)?.href ?? '/tools';
  return pageMetadata({ title: t.metaTitle, description: t.metaDescription, path: href });
}

/** "Build your personal plan" box; title and body default to the tool pages' copy. */
export function QuizCta({ title, body }: { title?: string; body?: string }) {
  const t = messages.cta;
  return (
    <aside className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
      <h2 className="text-lg font-semibold">{title ?? t.title}</h2>
      <p className="text-muted">{body ?? t.body}</p>
      <Link
        href={QUIZ_HREF}
        className="inline-flex min-h-12 items-center rounded-button bg-accent px-6 font-semibold text-on-accent transition-colors hover:bg-accent-pressed"
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
        <h1 className="text-2xl">{t.title}</h1>
        <p className="text-lg text-muted">{t.lead}</p>
      </header>

      {intro}

      <section aria-label={t.title}>{children}</section>

      <QuizCta />

      <article className="flex flex-col gap-6">
        {t.seo.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            <p className="leading-relaxed text-muted">{section.body}</p>
          </section>
        ))}
      </article>
    </main>
  );
}
