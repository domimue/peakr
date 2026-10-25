import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { card, primaryButton, secondaryButton } from '@/components/ui';
import { openCustomerPortal } from '@/features/account/actions';
import {
  storeManagementUrl,
  subscriptionViews,
  type EntitlementRow,
  type SubscriptionView,
} from '@/features/account/subscription';
import { signOut } from '@/features/auth/actions';
import { formatInstant } from '@/features/funnel/format';
import { openAppUrl } from '@/features/get-app/app-links';
import { OpenAppLink } from '@/features/get-app/open-app-link';
import { interpolate, messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';
import { currentUser, isAccount, sessionClient } from '@/lib/supabase/server';

const t = messages.funnel.account;

export const metadata = privateMetadata(t.metaTitle);

export default function AccountPage({ searchParams }: PageProps<'/account'>) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl">{t.title}</h1>
      <Suspense fallback={null}>
        <Account searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** Subscription status, Stripe customer portal or the store, the app, log out, deletion. */
async function Account({ searchParams }: Pick<PageProps<'/account'>, 'searchParams'>) {
  const params = await searchParams;
  const client = await sessionClient();
  const user = await currentUser(client);
  if (!client || !isAccount(user)) redirect('/login?next=/account');

  const [{ data: rows }, { data: cancelled }] = await Promise.all([
    client
      .from('entitlements')
      .select(
        'entitlement, product_id, store, period_type, will_renew, expires_at, price_string, management_url',
      )
      .returns<EntitlementRow[]>(),
    client
      .from('web_checkouts')
      .select('session_id')
      .eq('cancelled_reason', 'already_subscribed')
      .limit(1),
  ]);
  const views = subscriptionViews(rows ?? [], new Date());

  return (
    <>
      <p className="text-muted">{interpolate(t.signedInAs, { email: user.email ?? '' })}</p>
      {(cancelled ?? []).length > 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-sm">{t.cancelledNotice}</p>
      ) : null}

      <section className={card}>
        <h2 className="text-xl">{t.subscriptionTitle}</h2>
        {views.length === 0 ? (
          <>
            <p>{t.none}</p>
            <Link href="/quiz" className={`${primaryButton} self-start`}>
              {t.noneCta}
            </Link>
          </>
        ) : (
          views.map((view) => <Subscription key={view.entitlement} view={view} />)
        )}
        {params.error === 'portal' ? (
          <p role="alert" className="text-sm text-error-text">
            {t.portalError}
          </p>
        ) : null}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <OpenAppLink appHref={openAppUrl('account')} className={secondaryButton}>
          {t.getApp}
        </OpenAppLink>
        <form action={signOut}>
          <button type="submit" className={`${secondaryButton} w-full`}>
            {t.signOut}
          </button>
        </form>
      </div>

      <section className="flex flex-col gap-2 border-t border-border pt-6">
        <h2 className="text-lg">{t.deleteTitle}</h2>
        <p className="text-sm text-muted">{t.deleteLead}</p>
        <Link
          href="/account/delete"
          className="self-start text-sm font-medium underline underline-offset-2"
        >
          {t.deleteLink}
        </Link>
      </section>
    </>
  );
}

function Subscription({ view }: { view: SubscriptionView }) {
  const date = view.date ? formatInstant(view.date) : '';
  const storeUrl = view.store === 'stripe' ? null : storeManagementUrl(view);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{t.tiers[view.entitlement]}</h3>
        <span className="text-sm text-muted">{t.stores[view.store]}</span>
      </div>
      <p className="tabular-nums">{interpolate(t.status[view.status], { date })}</p>
      {view.price && (view.status === 'trial' || view.status === 'active') ? (
        <p className="text-sm text-muted tabular-nums">
          {interpolate(t.price, { price: view.price })}
        </p>
      ) : null}
      {view.store === 'stripe' ? (
        <form action={openCustomerPortal} className="flex flex-col gap-2">
          <button type="submit" className={`${primaryButton} self-start`}>
            {t.manage}
          </button>
          <p className="text-sm text-muted">{t.manageHint}</p>
        </form>
      ) : storeUrl ? (
        <div className="flex flex-col gap-2">
          <a href={storeUrl} className={`${secondaryButton} self-start`}>
            {view.store === 'app_store' ? t.manageAppStore : t.manageStore}
          </a>
          <p className="text-sm text-muted">{t.storeHint}</p>
        </div>
      ) : null}
    </div>
  );
}
