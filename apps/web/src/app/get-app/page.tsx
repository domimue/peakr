import { Suspense } from 'react';

import { primaryButton, secondaryButton } from '@/components/ui';
import { QrCode } from '@/features/get-app/qr-code';
import { storeLinks, type StoreLink } from '@/features/get-app/stores';
import { getVisitor } from '@/features/funnel/visitor';
import { interpolate, messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';
import { siteUrl } from '@/lib/site';

const t = messages.funnel.getApp;

export const metadata = pageMetadata({
  title: t.metaTitle,
  description: t.metaDescription,
  path: '/get-app',
});

/**
 * "Get the app" (CLAUDE.md "Website structure"), first version: store badges and a QR code for
 * desktop visitors. Opening an installed app via App Links / Universal Links follows in Phase 10d.
 */
export default function GetAppPage({ searchParams }: PageProps<'/get-app'>) {
  const stores = storeLinks();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl sm:text-3xl">{t.title}</h1>
        <p className="text-lg text-muted">{t.lead}</p>
        <Suspense fallback={null}>
          <Welcome searchParams={searchParams} />
        </Suspense>
      </div>

      <ol className="flex flex-col gap-3">
        {t.steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface font-semibold tabular-nums"
            >
              {i + 1}
            </span>
            <span className="pt-1">{step}</span>
          </li>
        ))}
      </ol>

      {stores.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          {stores.map((s) => (
            <StoreBadge key={s.store} link={s} />
          ))}
          {stores.some((s) => s.store === 'appStore') ? null : (
            <p className="text-sm text-muted">{t.iosSoon}</p>
          )}
        </div>
      ) : (
        <p className="rounded-2xl bg-surface p-4">{t.notYet}</p>
      )}

      <section className="hidden items-center gap-6 rounded-3xl border border-border p-6 sm:flex">
        <QrCode value={`${siteUrl()}/get-app`} label={t.qrAlt} />
        <div className="flex flex-col gap-2">
          <h2 className="text-lg">{t.qrTitle}</h2>
          <p className="text-muted">{t.qrLead}</p>
        </div>
      </section>
    </main>
  );
}

function StoreBadge({ link }: { link: StoreLink }) {
  const label = link.store === 'googlePlay' ? t.googlePlay : t.appStore;
  if (!link.badge) {
    return (
      <a href={link.url} className={link.store === 'googlePlay' ? primaryButton : secondaryButton}>
        {label}
      </a>
    );
  }
  return (
    <a href={link.url} className="inline-flex">
      {/* Official badge artwork, used unchanged as Google and Apple require. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={link.badge} alt={label} className="h-14 w-auto" />
    </a>
  );
}

async function Welcome({ searchParams }: Pick<PageProps<'/get-app'>, 'searchParams'>) {
  const params = await searchParams;
  if (params.welcome !== '1') return null;
  const visitor = await getVisitor();
  const email = visitor && !visitor.user.is_anonymous ? visitor.user.email : null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
      {email ? <p className="font-semibold">{interpolate(t.welcome, { email })}</p> : null}
      {params.cancelled === '1' ? <p>{t.alreadySubscribed}</p> : null}
      {params.kept === '1' ? <p className="text-sm text-muted">{t.keptPlan}</p> : null}
    </div>
  );
}
