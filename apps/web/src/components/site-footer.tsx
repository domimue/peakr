import Link from 'next/link';

import { interpolate, messages } from '@/i18n';
import { COPYRIGHT_YEAR } from '@/lib/site';

const t = messages.footer;

const FOOTER_LINKS = [
  { href: '/features', label: t.features },
  { href: '/pricing', label: t.pricing },
  { href: '/tools', label: t.tools },
  { href: '/privacy', label: t.privacy },
  { href: '/terms', label: t.terms },
  { href: '/imprint', label: t.imprint },
  { href: '/delete-account', label: t.deleteAccount },
] as const;

export function SiteFooter() {
  return (
    <footer className="theme-dark mt-auto border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{t.tagline}</p>
        <nav aria-label={t.label} className="flex flex-wrap gap-x-5 gap-y-2">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="hover:text-foreground">
              {label}
            </Link>
          ))}
          <span>{interpolate(t.copyright, { year: COPYRIGHT_YEAR })}</span>
        </nav>
      </div>
    </footer>
  );
}
