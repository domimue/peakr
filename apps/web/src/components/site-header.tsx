import Link from 'next/link';

import { PeakrLogo } from '@/components/brand/peakr-logo';
import { openAppUrl } from '@/features/get-app/app-links';
import { OpenAppLink } from '@/features/get-app/open-app-link';
import { QUIZ_HREF } from '@/features/tools/tools';
import { messages } from '@/i18n';

const t = messages.nav;

const NAV_LINKS = [
  { href: '/features', label: t.features },
  { href: '/pricing', label: t.pricing },
  { href: '/tools', label: t.tools },
] as const;

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
        <div className="flex min-w-0 items-center gap-3 text-sm font-medium sm:gap-5">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="text-muted hover:text-foreground">
              {label}
            </Link>
          ))}
          <Link href="/account" className="text-muted hover:text-foreground">
            {t.account}
          </Link>
          {/* Opens the installed app on a phone, Get the app on a computer. */}
          <OpenAppLink
            appHref={openAppUrl('header')}
            className="hidden text-muted hover:text-foreground md:inline"
          >
            {t.app}
          </OpenAppLink>
          <Link
            href={QUIZ_HREF}
            className="hidden rounded-button border-1.5 border-border px-4 py-2 font-semibold hover:bg-surface sm:inline-block"
          >
            {t.buildPlan}
          </Link>
        </div>
      </nav>
    </header>
  );
}
