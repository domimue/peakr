import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { card, primaryButton, secondaryButton } from '@/components/ui';
import { SignInForm } from '@/features/auth/sign-in-form';
import { completeCheckout } from '@/features/funnel/checkout';
import { formatInstant } from '@/features/funnel/format';
import { getVisitor } from '@/features/funnel/visitor';
import { interpolate, messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';
import { adminClient } from '@/lib/supabase/server';

const t = messages.funnel.success;

export const metadata = privateMetadata(t.metaTitle);

export default function SuccessPage({ searchParams }: PageProps<'/checkout/success'>) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <Suspense fallback={null}>
        <Success searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * Back from Stripe (CLAUDE.md "Web funnel flow" step 5): confirms the checkout (and hands it to
 * RevenueCat, in case the webhook has not arrived yet), then asks for the account – with the
 * checkout email, Google or Apple. Signing in leads to `/checkout/claim`. Also the target of the
 * "create your account" reminder email.
 */
async function Success({ searchParams }: Pick<PageProps<'/checkout/success'>, 'searchParams'>) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === 'string' ? params.session_id : '';
  const admin = adminClient();
  const result = admin
    ? await completeCheckout(admin, sessionId).catch((e: unknown) => {
        console.error('Confirming the checkout failed', String(e));
        return { status: 'open' as const };
      })
    : ({ status: 'invalid' } as const);

  if (result.status === 'invalid') return <Notice text={t.invalid} />;
  if (result.status === 'expired') {
    return (
      <Notice text={t.expired}>
        <Link href="/quiz/paywall" className={secondaryButton}>
          {t.backToPlan}
        </Link>
      </Notice>
    );
  }
  if (result.status === 'open') {
    return (
      <Notice text={t.pending}>
        <Link
          href={`/checkout/success?session_id=${encodeURIComponent(sessionId)}`}
          className={secondaryButton}
        >
          {t.refresh}
        </Link>
      </Notice>
    );
  }

  const claim = `/checkout/claim?session_id=${encodeURIComponent(sessionId)}`;
  const visitor = await getVisitor();
  // Already signed in to an account (bought as it, or came back later): attach right away – unless
  // that just failed, then show the sign-in again with the hint.
  if (visitor && !visitor.user.is_anonymous && !params.error) redirect(claim);

  const error =
    params.error === 'notYours'
      ? messages.funnel.claim.notYours
      : params.error === 'failed'
        ? messages.funnel.claim.failed
        : null;
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl">{result.withTrial ? t.title : t.titleNoTrial}</h1>
        <p className="text-lg text-muted">{t.lead}</p>
        {result.trialEnd ? (
          <p className="tabular-nums">
            {interpolate(t.trialEnds, { date: formatInstant(result.trialEnd) })}
          </p>
        ) : null}
      </div>
      <section className={card}>
        <h2 className="text-xl">{t.createTitle}</h2>
        <p className="text-muted">{interpolate(t.createLead, { email: result.email ?? '' })}</p>
        {error ? (
          <p role="alert" className="text-sm text-error-text">
            {error}
          </p>
        ) : null}
        <SignInForm next={claim} email={result.email ?? ''} />
      </section>
    </>
  );
}

function Notice({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-3xl bg-surface p-6">
      <p>{text}</p>
      {children ?? (
        <Link href="/" className={primaryButton}>
          {messages.nav.home}
        </Link>
      )}
    </section>
  );
}
