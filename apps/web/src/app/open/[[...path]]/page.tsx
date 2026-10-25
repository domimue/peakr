import { headers } from 'next/headers';
import { Suspense } from 'react';

import { appLinkOrigin, openAppUrl, placementOf } from '@/features/get-app/app-links';
import { InstallSection } from '@/features/get-app/install-section';
import { messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';
import { siteUrl } from '@/lib/site';

const t = messages.funnel.getApp;

export const metadata = privateMetadata(t.fallbackMetaTitle);

/**
 * `/open/...` – the app links' web side (docs/app-links.md). With Peakr installed, Android and iOS
 * open the app and this page is never loaded. When it loads, the app did not open – most likely
 * it is not installed – so it offers the store and goes there after a short moment (phones only).
 */
export default function OpenPage({ params, searchParams }: PageProps<'/open/[[...path]]'>) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl sm:text-3xl">{t.fallbackHeading}</h1>
        <p className="text-lg text-muted">{t.fallbackIntro}</p>
      </div>
      <Suspense fallback={null}>
        <Fallback params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Fallback({ params, searchParams }: PageProps<'/open/[[...path]]'>) {
  const [{ path }, query, head] = await Promise.all([params, searchParams, headers()]);
  const placement = placementOf(query.from);
  const target = (path ?? []).map(encodeURIComponent).join('/');
  // "Already installed?" leads to the same link on the other host: a link to the site the visitor
  // is already on would not open the app (iOS, Chrome). Only possible with a separate link host.
  const linkOrigin = appLinkOrigin();
  const site = siteUrl();
  const onLinkHost = head.get('host') === new URL(linkOrigin).host;
  const other = linkOrigin === site ? null : onLinkHost ? site : linkOrigin;
  return (
    <InstallSection
      variant="fallback"
      placement={placement}
      openUrl={other ? openAppUrl(placement, target, other) : null}
    />
  );
}
