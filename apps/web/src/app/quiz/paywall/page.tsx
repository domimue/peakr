import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { primaryButton, secondaryButton } from '@/components/ui';
import { paywallState, trialChargeDate } from '@/features/funnel/checkout';
import { formatInstant } from '@/features/funnel/format';
import { PaywallForm } from '@/features/funnel/paywall-form';
import { getVisitor, loadQuiz } from '@/features/funnel/visitor';
import { interpolate, messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';
import { formatMoney, trainingPrices } from '@/lib/stripe';
import { adminClient } from '@/lib/supabase/server';

const t = messages.funnel.paywall;

export const metadata = privateMetadata(t.metaTitle);

export default function PaywallPage({ searchParams }: PageProps<'/quiz/paywall'>) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl">{t.title}</h1>
        <p className="text-muted">{t.lead}</p>
      </div>
      <Suspense fallback={null}>
        <Paywall searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Paywall({ searchParams }: Pick<PageProps<'/quiz/paywall'>, 'searchParams'>) {
  const params = await searchParams;
  const visitor = await getVisitor();
  const quiz = visitor ? await loadQuiz(visitor).catch(() => null) : null;
  if (!visitor || !quiz?.finished) redirect('/quiz');

  const admin = adminClient();
  const [state, prices] = await Promise.all([
    admin ? paywallState(admin, visitor, quiz).catch(() => null) : null,
    trainingPrices(),
  ]);

  if (state?.kind === 'subscribed') {
    return (
      <section className="flex flex-col items-start gap-4 rounded-3xl bg-surface p-6">
        <p>{t.alreadySubscribed}</p>
        <Link href="/account" className={primaryButton}>
          {t.toAccount}
        </Link>
      </section>
    );
  }
  if (!state || !prices || params.error === 'unavailable') {
    return (
      <p role="alert" className="rounded-2xl bg-surface p-4 text-error-text">
        {t.unavailable}
      </p>
    );
  }

  return (
    <>
      {state.existingAccountEmail ? (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-border p-4">
          <p>{interpolate(t.emailHasPeakr, { email: state.existingAccountEmail })}</p>
          <Link href="/login?next=/quiz/paywall" className={secondaryButton}>
            {t.logIn}
          </Link>
        </section>
      ) : null}
      <PaywallForm
        withTrial={state.withTrial}
        chargeDate={formatInstant(trialChargeDate())}
        prices={{
          monthly: prices.monthly.formatted,
          yearly: prices.yearly.formatted,
          yearlyPerMonth: formatMoney(
            Math.round(prices.yearly.amount / 12),
            prices.yearly.currency,
          ),
        }}
      />
    </>
  );
}
