import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { useBillingStore, useEntitlement } from '@/features/billing/billing-store';
import { BODY_TRIAL_DAYS, bundleSavingPct } from '@/features/billing/model';
import { Badge, Button, Card, numeric, Screen, SegmentedControl, spacing, Text } from '@/ui';

import { BodyFeatureList } from '../components/feature-list';

/**
 * Paywall of the Body add-on (entitlement `body_nutrition`): on top of the Peakr subscription,
 * monthly or yearly, a 14-day free trial once per account – and the bundle "Peakr + Body" at a
 * discount, which goes through the normal tier paywall. Same billing system as everything else
 * (RevenueCat), prices from the store.
 */
export function BodyAddonScreen() {
  const { t } = useTranslation();
  const guard = useEntitlement('body_nutrition');
  const status = useBillingStore((s) => s.status);
  const packages = useBillingStore((s) => s.bodyPackages);
  const tierPackages = useBillingStore((s) => s.tierPackages);
  const tier = useBillingStore((s) => s.entitlements.tier);
  const trialUsed = useBillingStore((s) => s.bodyTrialUsed);
  const buyBody = useBillingStore((s) => s.buyBody);
  const restore = useBillingStore((s) => s.restore);
  const setDevBody = useBillingStore((s) => s.setDevBody);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!guard.visible) return <Redirect href="/today" />;

  const selected = packages.find((p) => p.period === period) ?? packages[0];
  // The trial is offered only to an account that never had one (unknown counts as used).
  const withTrial = trialUsed === false && selected?.trialDays != null;
  const priceOf = (list: typeof tierPackages, key: 'training' | 'plus' | null) =>
    list.find((p) => p.tier === key && p.period === period)?.price ?? 0;
  const saving = bundleSavingPct(
    priceOf(tierPackages, 'training'),
    selected?.price ?? 0,
    priceOf(tierPackages, 'plus'),
  );
  const bundle = tierPackages.find((p) => p.tier === 'plus' && p.period === period);

  const buy = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    const result = await buyBody(selected.id);
    setBusy(false);
    if (result === 'purchased') router.replace('/body');
    else if (result === 'error') setMessage(t('bodyAddon.paywall.failed'));
  };

  const doRestore = async () => {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    setMessage(t(ok ? 'bodyAddon.paywall.restored' : 'bodyAddon.paywall.restoreFailed'));
  };

  return (
    <Screen>
      <Text tone="secondary">{t('bodyAddon.tagline')}</Text>
      <BodyFeatureList />
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.paywall.onTop')}
      </Text>

      {guard.canWrite ? (
        <Card style={styles.card}>
          <Text variant="heading">{t('bodyAddon.paywall.active')}</Text>
          <Button
            variant="secondary"
            label={t('bodyAddon.paywall.manage')}
            onPress={() => router.push('/subscription')}
          />
        </Card>
      ) : status === 'unavailable' ? (
        <Card>
          <Text>{t('bodyAddon.paywall.unavailable')}</Text>
        </Card>
      ) : packages.length === 0 ? (
        <Text tone="secondary">{t('bodyAddon.paywall.loading')}</Text>
      ) : (
        <>
          {guard.state === 'expired' ? (
            <Text tone="secondary">{t('bodyAddon.paywall.reactivate')}</Text>
          ) : null}
          <SegmentedControl
            options={[
              { value: 'monthly', label: t('bodyAddon.paywall.monthly') },
              { value: 'yearly', label: t('bodyAddon.paywall.yearly') },
            ]}
            value={period}
            onChange={setPeriod}
          />
          {selected ? (
            <Card style={styles.card} testID="body-addon-offer">
              <Text variant="title" style={numeric}>
                {t(
                  selected.period === 'yearly'
                    ? 'bodyAddon.paywall.perYear'
                    : 'bodyAddon.paywall.perMonth',
                  { price: selected.priceString },
                )}
              </Text>
              <Text tone="secondary">
                {withTrial
                  ? t('bodyAddon.paywall.trial', { days: selected.trialDays ?? BODY_TRIAL_DAYS })
                  : t('bodyAddon.paywall.noTrial')}
              </Text>
            </Card>
          ) : null}
          <Button
            label={
              withTrial
                ? t('bodyAddon.paywall.start', { days: selected?.trialDays ?? BODY_TRIAL_DAYS })
                : t('bodyAddon.paywall.startPlain')
            }
            disabled={busy || !selected}
            onPress={buy}
          />

          {tier !== 'plus' && bundle ? (
            <Card style={styles.card} testID="body-bundle-offer">
              <Text variant="heading">{t('bodyAddon.paywall.bundleTitle')}</Text>
              {saving ? <Badge label={t('paywall.bundleSaving', { pct: saving })} /> : null}
              <Text tone="secondary">{t('bodyAddon.paywall.bundleBody')}</Text>
              <Button
                variant="secondary"
                label={t('bodyAddon.paywall.bundleAction', { price: bundle.priceString })}
                onPress={() => router.push(tier === 'none' ? '/paywall' : '/subscription')}
              />
            </Card>
          ) : null}

          <Button
            variant="secondary"
            label={t('bodyAddon.paywall.restore')}
            disabled={busy}
            onPress={doRestore}
          />
        </>
      )}

      {message ? <Text tone="secondary">{message}</Text> : null}
      {__DEV__ && !guard.canWrite ? (
        <Button
          variant="secondary"
          label={t('bodyAddon.paywall.devUnlock')}
          onPress={() => setDevBody(true)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
