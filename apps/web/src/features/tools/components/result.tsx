import type { ReactNode } from 'react';

import { messages } from '@/i18n';

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      {children}
    </div>
  );
}

export function EstimateBadge() {
  return (
    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted">
      {messages.common.estimate}
    </span>
  );
}

export interface ResultHeaderProps {
  label: string;
  value: string;
  isEstimate?: boolean;
  note?: string;
}

/** A prominent key result (e.g. "CSS pace 1:45 /100 m"), optionally marked as an estimate. */
export function ResultHeader({ label, value, isEstimate, note }: ResultHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xl font-bold tabular-nums">{value}</p>
        {isEstimate ? <EstimateBadge /> : null}
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}

/** Wraps a calculator's results; announced politely to screen readers when it appears. */
export function Results({ children }: { children: ReactNode }) {
  return (
    <section aria-live="polite" className="flex flex-col gap-4">
      {children}
    </section>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}
