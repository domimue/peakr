'use client';

import Link from 'next/link';
import { useState } from 'react';

import { SegmentedControl } from '@/features/tools/components/fields';
import { QUIZ_HREF } from '@/features/tools/tools';
import { interpolate, messages } from '@/i18n';

import {
  type BillingPeriod,
  GYM_ADDON,
  TIERS,
  type Tier,
  formatPrice,
  yearlySavingPercent,
} from './plans';

const t = messages.pricing;

/** Monthly/yearly toggle and one card per tier. */
export function PricingPlans() {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const saving = yearlySavingPercent(TIERS[0].prices);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2">
        <SegmentedControl
          label={t.billingLabel}
          options={[
            { value: 'monthly', label: t.monthly },
            { value: 'yearly', label: t.yearly },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <p className="text-sm text-muted">{interpolate(t.yearlySaving, { percent: saving })}</p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {TIERS.map((tier) => (
          <TierCard key={tier.key} tier={tier} period={period} />
        ))}
      </ul>
      <AddonCard period={period} />
    </div>
  );
}

/** The Gym add-on: a separate subscription, priced beside the tiers, never part of them. */
function AddonCard({ period }: { period: BillingPeriod }) {
  const copy = t.addon;
  const price = formatPrice(GYM_ADDON.prices[period]);
  return (
    <section
      aria-labelledby="gym-addon"
      className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="gym-addon" className="text-xl">
            {copy.name}
          </h2>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold">
            {t.trialBadge}
          </span>
        </div>
        <p className="text-muted">{copy.tagline}</p>
        <p className="text-sm text-muted">{copy.note}</p>
      </div>
      <p className="text-2xl font-semibold tabular-nums">
        {interpolate(period === 'monthly' ? t.perMonth : t.perYear, { price })}
      </p>
      <ul className="flex flex-col gap-2">
        {copy.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span aria-hidden="true" className="font-semibold text-accent-line">
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        <span className="font-semibold">{copy.withoutTitle}: </span>
        {copy.without}
      </p>
      <p className="text-sm font-semibold">{copy.howTo}</p>
    </section>
  );
}

function TierCard({ tier, period }: { tier: Tier; period: BillingPeriod }) {
  const copy = t.tiers[tier.key];
  const price = formatPrice(tier.prices[period]);
  return (
    <li
      className={`flex flex-col gap-5 rounded-3xl border bg-surface p-6 ${
        tier.comingSoon ? 'border-border' : 'border-accent-line'
      }`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl">{copy.name}</h2>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold">
            {tier.comingSoon ? t.comingSoon : t.trialBadge}
          </span>
        </div>
        <p className="text-muted">{copy.tagline}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-2xl font-semibold tabular-nums">
          {interpolate(period === 'monthly' ? t.perMonth : t.perYear, { price })}
        </p>
        {period === 'yearly' ? (
          <p className="text-sm text-muted tabular-nums">
            {interpolate(t.yearlyEquivalent, {
              price: formatPrice(Math.round((tier.prices.yearly / 12) * 100) / 100),
            })}
          </p>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {copy.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span aria-hidden="true" className="font-semibold text-accent-line">
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        {tier.comingSoon ? (
          <p className="text-sm font-semibold text-muted">{t.comingSoon}</p>
        ) : (
          <Link
            href={QUIZ_HREF}
            className="inline-flex min-h-12 items-center rounded-button bg-accent px-6 font-semibold text-on-accent transition-colors hover:bg-accent-pressed"
          >
            {t.choose}
          </Link>
        )}
      </div>
    </li>
  );
}
