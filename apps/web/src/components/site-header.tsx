import Link from 'next/link';

import { messages } from '@/i18n';

const t = messages.nav;

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
      >
        {t.skipToContent}
      </a>
      <nav
        aria-label={t.label}
        className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4"
      >
        <Link href="/" className="text-xl font-bold tracking-tight">
          {t.home}
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/tools" className="text-muted hover:text-foreground">
            {t.tools}
          </Link>
          <Link
            href="/#waitlist"
            className="hidden rounded-full bg-primary px-4 py-2 font-semibold text-on-primary hover:opacity-90 sm:inline-block"
          >
            {t.waitlist}
          </Link>
        </div>
      </nav>
    </header>
  );
}
