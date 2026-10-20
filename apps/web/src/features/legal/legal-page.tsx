import type { ReactNode } from 'react';

import { interpolate, messages } from '@/i18n';

/** Name, address and email of the operator (Swiss sole proprietorship). */
export function OperatorAddress() {
  const o = messages.legal.operator;
  return (
    <address className="not-italic leading-relaxed">
      {o.name}
      <br />
      {o.business}
      <br />
      {o.address}
      <br />
      <a href={`mailto:${o.email}`} className="underline underline-offset-2">
        {o.email}
      </a>
    </address>
  );
}

/** Shown on legal texts that have not been legally reviewed yet. */
export function DraftNotice() {
  const t = messages.legal.draftNotice;
  return (
    <aside
      aria-label={t.title}
      className="flex flex-col gap-1 rounded-2xl border-1.5 border-warning bg-surface p-4"
    >
      <p className="font-semibold text-warning-text">{t.title}</p>
      <p className="text-sm text-muted">{t.body}</p>
    </aside>
  );
}

/** Line with the date a legal text was last changed. */
export function LegalUpdated({ date }: { date: string }) {
  return <p className="text-sm text-muted">{interpolate(messages.legal.updated, { date })}</p>;
}

export function LegalPage({
  title,
  draft = false,
  children,
}: {
  title: string;
  /** Marks the page as an unreviewed draft. */
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12">
      <h1 className="text-2xl">{title}</h1>
      {draft ? <DraftNotice /> : null}
      {children}
    </main>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <div className="leading-relaxed text-muted">{children}</div>
    </section>
  );
}
