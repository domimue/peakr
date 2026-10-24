import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Screen, spacing, Text } from '@/ui';

import type { PackageSummary } from '../billing-client';
import { useAccess, useBillingStore } from '../billing-store';
import { cancelUrlOf, PURCHASABLE_TIERS, type ActiveSubscription } from '../model';

function formatDate(iso: string | null, locale: string, fallback: string): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Profile → Subscription (CLAUDE.md "Monetisation"): the training tier and the Gym add-on side by
 * side – period, price, next billing date or trial end – each with its own change and cancel
 * links, so one can be cancelled without touching the other. Store purchases switch period or
 * tier through the store's change flow and cancel on the store's page for that exact
 * subscription; web (Stripe) subscriptions are managed on the website, never linked from here
 * (store rules).
 */
export function SubscriptionScreen() {
  const { t, i18n } = useTranslation();
  const subscriptions = useBillingStore((s) => s.subscriptions);
  const packages = useBillingStore((s) => s.tierPackages);
  const status = useBillingStore((s) => s.status);
  const devGym = useBillingStore((s) => s.devGym);
  const buyTier = useBillingStore((s) => s.buyTier);
  const restore = useBillingStore((s) => s.restore);
  const access = useAccess();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const tier = subscriptions.find((s) => s.kind === 'tier');
  const addon = subscriptions.find((s) => s.kind === 'gym');

  const change = async (pkg: PackageSummary) => {
    setBusy(true);
    setMessage(null);
    const result = await buyTier(pkg.id);
    setBusy(false);
    if (result === 'purchased') setMessage(t('subscription.changed'));
    else if (result === 'error') setMessage(t('subscription.changeFailed'));
  };

  const doRestore = async () => {
    setBusy(true);
    setMessage(null);
    const ok = await restore();
    setBusy(false);
    setMessage(t(ok ? 'subscription.restored' : 'subscription.restoreFailed'));
  };

  // Other plans of the current store subscription: the other period, and Plus once it ships.
  const switches =
    tier && tier.store !== 'stripe'
      ? packages.filter(
          (p) =>
            p.tier !== null &&
            !(p.tier === tier.entitlement && p.period === tier.period) &&
            (p.tier === tier.entitlement || PURCHASABLE_TIERS.includes(p.tier)),
        )
      : [];

  return (
    <Screen title={t('subscription.title')}>
      <Text tone="secondary">{t('subscription.intro')}</Text>

      <Section
        title={t('subscription.tierTitle')}
        subscription={tier}
        name={tier ? t(`subscription.tierNames.${tier.entitlement as 'training' | 'plus'}`) : ''}
        locale={i18n.language}
        action={
          tier ? (
            <>
              {switches.map((pkg) => (
                <Button
                  key={pkg.id}
                  variant="secondary"
                  disabled={busy}
                  label={t(
                    pkg.tier === tier.entitlement
                      ? `subscription.switchTo.${pkg.period ?? 'monthly'}`
                      : 'subscription.switchTo.plus',
                    { price: pkg.priceString },
                  )}
                  onPress={() => void change(pkg)}
                />
              ))}
              {tier.entitlement === 'training' && !PURCHASABLE_TIERS.includes('plus') ? (
                <View style={styles.row}>
                  <Text tone="secondary" style={styles.flex}>
                    {t('subscription.plusSoon')}
                  </Text>
                  <Badge label={t('paywall.comingSoon')} />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text tone="secondary">
                {t(access === 'readOnly' ? 'subscription.endedNote' : 'subscription.noneNote')}
              </Text>
              <Button label={t('subscription.seePlans')} onPress={() => router.push('/paywall')} />
            </>
          )
        }
      />
      <Section
        title={t('subscription.addonTitle')}
        subscription={addon}
        name={t('gymAddon.title')}
        locale={i18n.language}
        action={
          addon || devGym ? null : (
            <Button label={t('subscription.getAddon')} onPress={() => router.push('/gym/addon')} />
          )
        }
      />

      {message ? <Text tone="secondary">{message}</Text> : null}
      <Button
        variant="secondary"
        label={t('subscription.restore')}
        disabled={busy || status !== 'ready'}
        onPress={() => void doRestore()}
      />
    </Screen>
  );
}

function Section({
  title,
  subscription,
  name,
  locale,
  action,
}: {
  title: string;
  subscription: ActiveSubscription | undefined;
  name: string;
  locale: string;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const dash = t('subscription.unknownDate');
  if (!subscription) {
    return (
      <Card style={styles.card} testID={`subscription-${title}`}>
        <Text variant="heading">{title}</Text>
        <Text tone="secondary">{t('subscription.none')}</Text>
        {action}
      </Card>
    );
  }
  const date = formatDate(subscription.expiresAt, locale, dash);
  const dateLabel = !subscription.willRenew
    ? t('subscription.endsOn')
    : subscription.isTrial
      ? t('subscription.trialEnds')
      : t('subscription.nextBilling');
  const store = t(`subscription.store.${subscription.store}`);
  const cancelUrl = cancelUrlOf(subscription);
  const rows: [string, string][] = [
    [t(`subscription.period.${subscription.period ?? 'monthly'}`), name],
    ...(subscription.priceString
      ? [[t('subscription.price'), subscription.priceString] as [string, string]]
      : []),
    [dateLabel, date],
    [
      t('subscription.status'),
      t(
        !subscription.willRenew
          ? 'subscription.statusCancelled'
          : subscription.isTrial
            ? 'subscription.statusTrial'
            : 'subscription.statusActive',
      ),
    ],
  ];
  return (
    <Card style={styles.card} testID={`subscription-${subscription.kind}`}>
      <Text variant="heading">{title}</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text tone="secondary" style={styles.flex}>
            {label}
          </Text>
          <Text style={styles.number}>{value}</Text>
        </View>
      ))}
      {subscription.isTrial && subscription.willRenew ? (
        <Text variant="caption" tone="secondary">
          {t('subscription.trialNote', { date })}
        </Text>
      ) : null}
      {!subscription.willRenew ? (
        <Text variant="caption" tone="secondary">
          {t(
            subscription.kind === 'tier'
              ? 'subscription.cancelledNote'
              : 'subscription.cancelledAddonNote',
            { date },
          )}
        </Text>
      ) : null}
      {subscription.willRenew ? action : null}
      {subscription.store === 'stripe' ? (
        <Text variant="caption" tone="secondary">
          {t('subscription.manageOnWeb')}
        </Text>
      ) : cancelUrl ? (
        <>
          <Button
            variant="secondary"
            label={t(subscription.willRenew ? 'subscription.cancel' : 'subscription.manage')}
            onPress={() => void Linking.openURL(cancelUrl)}
          />
          <Text variant="caption" tone="secondary">
            {t('subscription.cancelOnly', { store })}
          </Text>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  number: { fontVariant: ['tabular-nums'] },
});
