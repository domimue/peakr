import { toPlanInput } from '@peakr/quiz';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { authAvailable, selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { useBaselineStore } from '@/features/baseline/baseline-store';
import { calibrateOnboarding } from '@/features/baseline/calibration';
import type { PackageSummary } from '@/features/billing/billing-client';
import { useAccess, useBillingStore } from '@/features/billing/billing-store';
import { legalLinks } from '@/features/billing/links';
import { firstChargeDate, PURCHASABLE_TIERS, type TierKey } from '@/features/billing/model';
import { useQuizStore } from '@/features/onboarding/quiz-store';
import { useCreatePlan, usePlan } from '@/features/plan/queries';
import {
  Badge,
  Button,
  Card,
  numeric,
  Screen,
  SegmentedControl,
  spacing,
  Text,
  useTheme,
} from '@/ui';

type Period = 'monthly' | 'yearly';

const INCLUDED: Record<TierKey, readonly string[]> = {
  training: ['plan', 'calendar', 'zones', 'routes', 'integrations', 'health'],
  plus: ['everything', 'nutrition', 'energy', 'body'],
};

/**
 * Paywall after the forecast (CLAUDE.md "Monetisation"): the two tiers, monthly or yearly, prices
 * and trial length from the store via RevenueCat, the exact first charge date and the reminder
 * one day before, restore purchases. In-app purchase only – no link to the web checkout. After a
 * purchase the plan is created and an anonymous quiz user signs in (the purchase moves with them).
 */
export function PaywallScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { answers, hydrate } = useQuizStore();
  const createPlan = useCreatePlan();
  const plan = usePlan();
  const signedIn = useSessionStore((s) => selectAccountUserId(s) !== null);
  const status = useBillingStore((s) => s.status);
  const packages = useBillingStore((s) => s.tierPackages);
  const buyTier = useBillingStore((s) => s.buyTier);
  const restore = useBillingStore((s) => s.restore);
  const setDevTraining = useBillingStore((s) => s.setDevTraining);
  const access = useAccess();
  const [period, setPeriod] = useState<Period>('yearly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
    void useBaselineStore.getState().hydrate();
  }, [hydrate]);

  const priceOf = (tier: TierKey): PackageSummary | undefined =>
    packages.find((p) => p.tier === tier && p.period === period);
  const selected = priceOf('training');
  const trialDays = selected?.trialDays ?? null;
  const store = t(
    Platform.OS === 'ios' ? 'subscription.store.app_store' : 'subscription.store.play_store',
  );
  const perPeriod = (p: PackageSummary) =>
    t(p.period === 'monthly' ? 'paywall.perMonth' : 'paywall.perYear', { price: p.priceString });
  const chargeDate = trialDays
    ? firstChargeDate(new Date(), trialDays).toLocaleDateString(i18n.language, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  /** After a purchase (or restore): the plan from the quiz, then sign-in for an anonymous user. */
  const continueToPlan = () => {
    const next = authAvailable && !signedIn ? '/auth/sign-in' : '/today';
    if (plan.data) return router.replace(next);
    const today = todayIso();
    const input = toPlanInput(answers, today);
    if (!input.ok) return router.replace('/onboarding/quiz');
    const { profile, goal, availability, startDate, targetDate, hrZones, stravaHrZones } =
      calibrateOnboarding(input.value, useBaselineStore.getState(), today);
    createPlan.mutate(
      {
        profile,
        goal,
        availability,
        startDate,
        hrZones,
        ...(targetDate ? { targetDate } : {}),
        ...(stravaHrZones ? { stravaHrZones } : {}),
      },
      // App flow: purchase → account → plan. The plan made before sign-in moves into the account.
      { onSuccess: () => router.replace(next) },
    );
  };

  const buy = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    const result = await buyTier(selected.id);
    setBusy(false);
    if (result === 'purchased') continueToPlan();
    else if (result === 'error') setMessage(t('paywall.failed'));
  };

  const doRestore = async () => {
    setBusy(true);
    setMessage(null);
    const ok = await restore();
    setBusy(false);
    const tier = useBillingStore.getState().entitlements.tier;
    if (ok && tier !== 'none') return continueToPlan();
    setMessage(t(ok ? 'paywall.nothingToRestore' : 'paywall.restoreFailed'));
  };

  if (access === 'full' && status === 'ready') {
    return (
      <Screen title={t('paywall.title')}>
        <Card>
          <Text variant="heading">{t('paywall.active')}</Text>
          <Button
            label={t('paywall.continue')}
            disabled={createPlan.isPending}
            onPress={continueToPlan}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={t('paywall.title')}>
      <SegmentedControl
        options={[
          { value: 'monthly', label: t('paywall.monthly') },
          { value: 'yearly', label: t('paywall.yearly') },
        ]}
        value={period}
        onChange={setPeriod}
      />

      {(['training', 'plus'] as const).map((tier) => {
        const purchasable = PURCHASABLE_TIERS.includes(tier);
        const price = priceOf(tier);
        return (
          <View key={tier} testID={`paywall-tier-${tier}`}>
            <Card
              style={[
                styles.tier,
                purchasable ? { borderColor: colors.accentLine, borderWidth: 1.5 } : null,
              ]}
            >
              <View style={styles.row}>
                <Text variant="heading" style={styles.flex}>
                  {t(`paywall.tiers.${tier}.name`)}
                </Text>
                {purchasable ? null : <Badge label={t('paywall.comingSoon')} />}
              </View>
              {purchasable && price ? (
                <Text variant="title" style={numeric}>
                  {perPeriod(price)}
                </Text>
              ) : null}
              <Text tone="secondary">{t(`paywall.tiers.${tier}.description`)}</Text>
              {INCLUDED[tier].map((key) => (
                <Text
                  key={key}
                  variant="caption"
                >{`✓  ${t(`paywall.included.${key}` as never) as string}`}</Text>
              ))}
            </Card>
          </View>
        );
      })}

      {status === 'unavailable' || status === 'error' ? (
        <Card>
          <Text>{t(status === 'error' ? 'paywall.loadFailed' : 'paywall.unavailable')}</Text>
        </Card>
      ) : !selected ? (
        <Text tone="secondary">{t('paywall.loading')}</Text>
      ) : (
        <View style={styles.offer}>
          {chargeDate ? (
            <>
              <Text style={[styles.strong, numeric]} testID="paywall-charge-line">
                {t('paywall.freeUntil', { date: chargeDate, price: perPeriod(selected) })}
              </Text>
              <Text tone="secondary">{t('paywall.reminder')}</Text>
              <Text variant="caption" tone="secondary">
                {t('paywall.trialTerms', { store })}
              </Text>
            </>
          ) : (
            <Text variant="caption" tone="secondary">
              {t('paywall.noTrialTerms', { price: perPeriod(selected), store })}
            </Text>
          )}
          <Button
            label={
              trialDays ? t('paywall.startTrial', { days: trialDays }) : t('paywall.subscribe')
            }
            disabled={busy || createPlan.isPending}
            onPress={buy}
          />
          <Text variant="caption" tone="secondary">
            {t('paywall.cancelAnytime', { store })}
          </Text>
        </View>
      )}

      {message ? <Text tone="secondary">{message}</Text> : null}
      <Button
        variant="secondary"
        label={t('paywall.restore')}
        disabled={busy || status !== 'ready'}
        onPress={doRestore}
      />
      {legalLinks ? (
        <View style={styles.row}>
          <Button
            variant="secondary"
            small
            label={t('paywall.terms')}
            onPress={() => void Linking.openURL(legalLinks?.terms ?? '')}
          />
          <Button
            variant="secondary"
            small
            label={t('paywall.privacy')}
            onPress={() => void Linking.openURL(legalLinks?.privacy ?? '')}
          />
        </View>
      ) : null}
      {__DEV__ ? (
        <Button
          variant="secondary"
          label={t('plan.devStart')}
          disabled={createPlan.isPending}
          onPress={() => {
            setDevTraining(true);
            continueToPlan();
          }}
        />
      ) : null}
      <Button variant="secondary" label={t('paywall.back')} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  tier: { gap: spacing.xs },
  offer: { gap: spacing.sm },
  strong: { fontWeight: '600' },
});
