'use client';

import Link from 'next/link';
import { useState } from 'react';

import { primaryButton } from '@/components/ui';
import { interpolate, messages } from '@/i18n';
import type { Period } from '@/lib/stripe';

import { startCheckout } from './checkout-actions';

const t = messages.funnel.paywall;
const tiers = messages.pricing.tiers;

export interface PaywallPrices {
  monthly: string;
  yearly: string;
  /** Yearly price per month, e.g. "CHF 4.92". */
  yearlyPerMonth: string;
}

/**
 * Tier and period choice → Stripe Checkout. Training is purchasable; Training + Nutrition is shown
 * as coming soon (CLAUDE.md "Monetisation"). States the trial, the exact first charge date and the
 * reminder before the visitor leaves for Stripe.
 */
export function PaywallForm({
  prices,
  withTrial,
  chargeDate,
}: {
  prices: PaywallPrices;
  withTrial: boolean;
  chargeDate: string;
}) {
  const [period, setPeriod] = useState<Period>('yearly');
  const price = period === 'yearly' ? prices.yearly : prices.monthly;
  const perPeriod = interpolate(period === 'yearly' ? t.perYear : t.perMonth, { price });

  return (
    <form action={startCheckout} className="flex flex-col gap-6">
      <input type="hidden" name="tier" value="training" />
      <fieldset className="grid grid-cols-2 gap-1 rounded-button bg-surface-2 p-1">
        <legend className="sr-only">{t.billingLabel}</legend>
        {(['monthly', 'yearly'] as const).map((p) => (
          <label
            key={p}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl font-semibold has-[:checked]:bg-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-line"
          >
            <input
              type="radio"
              name="period"
              value={p}
              checked={period === p}
              onChange={() => setPeriod(p)}
              className="sr-only"
            />
            {t[p]}
          </label>
        ))}
      </fieldset>

      <section className="flex flex-col gap-3 rounded-3xl border-1.5 border-accent-line bg-surface p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl">{tiers.training.name}</h2>
          <p className="font-display text-xl tabular-nums">{perPeriod}</p>
        </div>
        {period === 'yearly' ? (
          <p className="text-sm text-muted tabular-nums">
            {interpolate(t.yearlyEquivalent, { price: prices.yearlyPerMonth })}
          </p>
        ) : null}
        <p className="text-muted">{tiers.training.tagline}</p>
        <ul className="flex flex-col gap-1.5">
          {tiers.training.features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <span aria-hidden="true">✓</span>
              {feature}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-3xl border border-border p-6 opacity-70">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg">{tiers.plus.name}</h2>
          <span className="rounded-full bg-surface-2 px-3 py-0.5 text-sm font-semibold">
            {t.comingSoon}
          </span>
        </div>
        <p className="text-sm text-muted">{tiers.plus.tagline}</p>
      </section>

      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 tabular-nums">
        {withTrial ? (
          <>
            <p className="font-semibold">{interpolate(t.trialFree, { price: perPeriod })}</p>
            <p className="text-sm">{interpolate(t.firstCharge, { date: chargeDate })}</p>
            <p className="text-sm text-muted">
              {interpolate(t.cancelAnytime, { date: chargeDate })}
            </p>
          </>
        ) : (
          <p className="text-sm">{t.noTrial}</p>
        )}
      </div>

      <button type="submit" className={`${primaryButton} w-full`}>
        {withTrial ? t.start : t.startNoTrial}
      </button>
      <p className="text-sm text-muted">{t.secure}</p>
      <p className="text-sm text-muted">
        {t.legal.split('{{terms}}').map((part, i) =>
          i === 0 ? (
            part
          ) : (
            <span key={i}>
              <Link href="/terms" className="underline underline-offset-2">
                {t.termsLink}
              </Link>
              {part}
            </span>
          ),
        )}
      </p>
    </form>
  );
}
