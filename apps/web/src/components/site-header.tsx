import Link from 'next/link';

import { PeakrLogo } from '@/components/brand/peakr-logo';
import { messages } from '@/i18n';

const t = messages.nav;

/** Dark header (Ink) with the lockup; the page's single Volt action lives in the content. */
export function SiteHeader() {
  return (
    <header className="theme-dark border-b border-border bg-background text-foreground">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-button focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        {t.skipToContent}
      </a>
      <nav
        aria-label={t.label}
        className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4"
      >
        <Link href="/" aria-label={t.home} className="flex items-center">
          <PeakrLogo tone="onDark" height={28} title={t.home} />
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/tools" className="text-muted hover:text-foreground">
            {t.tools}
          </Link>
          <Link
            href="/#waitlist"
            className="hidden rounded-button border-1.5 border-border px-4 py-2 font-semibold hover:bg-surface sm:inline-block"
          >
            {t.waitlist}
          </Link>
        </div>
      </nav>
    </header>
  );
}
