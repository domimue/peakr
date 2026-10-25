import { Suspense } from 'react';

import { appLinkOrigin, openAppUrl, placementOf } from '@/features/get-app/app-links';
import { InstallSection } from '@/features/get-app/install-section';
import { getVisitor } from '@/features/funnel/visitor';
import { interpolate, messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';

const t = messages.funnel.getApp;

export const metadata = pageMetadata({
  title: t.metaTitle,
  description: t.metaDescription,
  path: '/get-app',
});

/**
 * "Get the app" (CLAUDE.md "Website structure"): reached from the checkout, the account page and
 * the header. On a phone: "Open Peakr" (an app link – the app opens if it is installed) and the
 * store; on a computer: both store badges and a QR code. See docs/app-links.md.
 */
export default function GetAppPage({ searchParams }: PageProps<'/get-app'>) {
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

      <Suspense fallback={null}>
        <Install searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Install({ searchParams }: Pick<PageProps<'/get-app'>, 'searchParams'>) {
  const params = await searchParams;
  // Straight from the checkout (`welcome=1`) or from a link that names where it was placed.
  const placement = params.welcome === '1' ? 'checkout' : placementOf(params.from);
  return (
    <InstallSection
      variant="getApp"
      placement={placement}
      openUrl={openAppUrl(placement, '', appLinkOrigin())}
    />
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
