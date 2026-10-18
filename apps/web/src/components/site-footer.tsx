import Link from 'next/link';

import { interpolate, messages } from '@/i18n';
import { COPYRIGHT_YEAR } from '@/lib/site';

const t = messages.footer;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{t.tagline}</p>
        <nav aria-label={t.label} className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/tools" className="hover:text-foreground">
            {t.tools}
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            {t.privacy}
          </Link>
          <Link href="/imprint" className="hover:text-foreground">
            {t.imprint}
          </Link>
          <span>{interpolate(t.copyright, { year: COPYRIGHT_YEAR })}</span>
        </nav>
      </div>
    </footer>
  );
}
