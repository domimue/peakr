import type { Metadata } from 'next';
import Link from 'next/link';

import { QuizCta } from '@/features/tools/tool-page';
import { TOOLS } from '@/features/tools/tools';
import { messages } from '@/i18n';

const t = messages.tools;

export const metadata: Metadata = {
  title: t.index.metaTitle,
  description: t.index.metaDescription,
};

export default function ToolsIndexPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold tracking-tight">{t.index.title}</h1>
        <p className="text-lg text-muted">{t.index.subtitle}</p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.key}>
            <Link
              href={tool.href}
              className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface-selected"
            >
              <h2 className="text-lg font-semibold">{t[tool.key].title}</h2>
              <p className="text-muted">{t[tool.key].description}</p>
              <span className="mt-auto text-sm font-semibold text-primary">{t.index.open} →</span>
            </Link>
          </li>
        ))}
      </ul>

      <QuizCta />
    </main>
  );
}
