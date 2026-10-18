import type { ReactNode } from 'react';

import { messages } from '@/i18n';

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

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{heading}</h2>
      <div className="leading-relaxed text-muted">{children}</div>
    </section>
  );
}
