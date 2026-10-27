import {
  customRate,
  goalForecast,
  goalTargets,
  maxRateFor,
  ratePresets,
  validateWeightGoal,
  type WeightGoalKind,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useEntitlement } from '@/features/billing/billing-store';
import {
  Button,
  Card,
  ChoiceList,
  ListState,
  numeric,
  Screen,
  SegmentedControl,
  Slider,
  spacing,
  Text,
  TextField,
} from '@/ui';

import { EVERYDAY_ACTIVITIES, type EverydayActivity } from '../energy-settings';
import { useBodyModel } from '../model';
import { useBodyProfile } from '../profile';
import { useAddCheckIn, useSaveEnergySettings, useSaveGoal } from '../queries';

type Step = 'everyday' | 'current' | 'target' | 'rate' | 'summary';

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Goal setup (Body): current weight → target weight → rate (presets and a slider, live preview of
 * daily kcal, protein and goal date) → summary. All numbers and every safety rule come from the
 * engine; presets above the safe rate are shown disabled with the reason.
 */
export function GoalSetupScreen() {
  const { t, i18n } = useTranslation();
  const guard = useEntitlement('body_nutrition');
  const model = useBodyModel();
  const profile = useBodyProfile();
  const saveGoal = useSaveGoal();
  const addCheckIn = useAddCheckIn();
  const saveEnergy = useSaveEnergySettings();
  const current = model?.goal;
  const hasTrend = (model?.trend.length ?? 0) > 0;
  const [step, setStep] = useState<Step>('current');
  const [everydayAnswered, setEverydayAnswered] = useState(false);
  const [weight, setWeight] = useState(model ? String(model.trendKg) : '');
  const [target, setTarget] = useState(
    current?.targetWeightKg ? String(current.targetWeightKg) : '',
  );
  const [maintain, setMaintain] = useState(current?.kind === 'maintain');
  const [rate, setRate] = useState(
    current && current.ratePerWeekKg > 0 ? current.ratePerWeekKg : 0.5,
  );

  const p = profile.data?.profile;
  if (!guard.canWrite) return <ListState kind="empty" title={t('bodyAddon.goal.locked')} />;
  if (!model || !p || !model.basis) return <ListState kind="loading" label={t('common.loading')} />;
  const basis = model.basis;
  // The everyday activity is asked once, before the first goal (editable in Body → Energy targets).
  const shown: Step =
    step === 'current' && model.energy.everydayActivity === null && !everydayAnswered
      ? 'everyday'
      : step;

  const today = todayIso();
  const currentKg = (hasTrend ? model.trendKg : parse(weight)) ?? model.trendKg;
  const targetKg = parse(target);
  const kind: WeightGoalKind =
    maintain || targetKg === null || targetKg === currentKg
      ? 'maintain'
      : targetKg < currentKg
        ? 'lose'
        : 'gain';
  const maxRate = maxRateFor(kind, currentKg);
  const usedRate = kind === 'maintain' ? 0 : Math.min(rate, maxRate);
  const check = validateWeightGoal({
    kind,
    targetWeightKg: targetKg ?? undefined,
    ratePerWeekKg: kind === 'maintain' ? undefined : Math.max(0.05, usedRate),
    sex: p.sex,
    birthDate: p.birthDate,
    heightCm: p.heightCm,
    trendWeightKg: currentKg,
    today,
  });
  const targets = goalTargets({
    kind,
    ratePerWeekKg: usedRate,
    nonExerciseTdeeKcal: basis.nonExerciseKcal,
    plannedDailyKcal: model.goalPlannedDailyKcal,
    bmrKcal: basis.bmrKcal,
    sex: p.sex,
    weightKg: currentKg,
    proteinGPerKg: model.energy.proteinGPerKg,
  });
  // Below the floor the targets are those of the proposed rate – only once it is accepted.
  const belowFloor = targets.status === 'belowFloor';
  const forecast = goalForecast({
    kind,
    startKg: currentKg,
    targetKg: targetKg ?? currentKg,
    ratePerWeekKg: targets.ratePerWeekKg,
    trend: model.trend,
    today,
  });
  const presets =
    kind === 'maintain'
      ? []
      : ratePresets({
          kind,
          weightKg: currentKg,
          nonExerciseTdeeKcal: basis.nonExerciseKcal,
          plannedDailyKcal: model.goalPlannedDailyKcal,
          bmrKcal: basis.bmrKcal,
          sex: p.sex,
        });
  const date = (iso: string | null) =>
    iso
      ? new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { dateStyle: 'medium' })
      : '–';
  const issue = check.ok ? null : check.issues[0];

  const save = async () => {
    if (!check.ok) return;
    if (!hasTrend) {
      await addCheckIn.mutateAsync({
        day: today,
        weightKg: currentKg,
        waistCm: null,
        bodyFatPct: null,
        note: null,
      });
    }
    await saveGoal.mutateAsync({
      kind,
      startWeightKg: currentKg,
      targetWeightKg: kind === 'maintain' ? null : targetKg,
      ratePerWeekKg: targets.ratePerWeekKg,
      // Stored for older app versions; planned training is always part of the week's target.
      eatBackPct: 100,
      weeklyMode: true,
      adjustmentKcal: 0,
      paused: false,
      reason: targets.reason,
    });
    router.back();
  };

  const preview = (
    <Card style={styles.card} testID="goal-preview">
      <Text variant="title" style={numeric}>
        {t('bodyAddon.goal.dailyKcal', { kcal: targets.dailyKcal })}
      </Text>
      <Text tone="secondary" style={numeric}>
        {t('bodyAddon.goal.protein', {
          grams: targets.protein.grams,
          perKg: targets.protein.gPerKg,
        })}
      </Text>
      {kind !== 'maintain' ? (
        <Text tone="secondary">
          {t('bodyAddon.goal.goalDate', { date: date(forecast.plannedDate) })}
        </Text>
      ) : null}
      {belowFloor && targets.proposedRatePerWeekKg !== null ? (
        <View testID="goal-floor" style={styles.card}>
          <Text>
            {t('bodyAddon.goal.belowFloor', {
              requested: targets.requestedRatePerWeekKg,
              kcal: targets.floorKcal,
              proposed: targets.proposedRatePerWeekKg,
            })}
          </Text>
          <Button
            variant="secondary"
            testID="goal-use-proposed"
            label={t('bodyAddon.goal.useProposed', { rate: targets.proposedRatePerWeekKg })}
            onPress={() => setRate(targets.proposedRatePerWeekKg as number)}
          />
        </View>
      ) : null}
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.goal.trainingIncluded')}
      </Text>
      <Text variant="caption" tone="secondary">
        {t(
          basis.source === 'adaptive'
            ? 'bodyAddon.goal.basisAdaptive'
            : 'bodyAddon.goal.basisFormula',
          {
            kcal: basis.tdeeKcal,
          },
        )}
      </Text>
    </Card>
  );

  return (
    <Screen>
      <Text variant="caption" tone="secondary">
        {t(`bodyAddon.goal.step.${shown}`)}
      </Text>

      {shown === 'everyday' ? (
        <>
          <Text variant="heading">{t('bodyAddon.energy.everydayTitle')}</Text>
          <Text tone="secondary">{t('bodyAddon.energy.everydayHint')}</Text>
          <ChoiceList
            label={t('bodyAddon.energy.everydayTitle')}
            choices={EVERYDAY_ACTIVITIES.map((a) => ({
              value: a,
              label: t(`bodyAddon.energy.everyday.${a}.label`),
              description: t(`bodyAddon.energy.everyday.${a}.description`),
            }))}
            value={model.energy.everydayActivity ?? undefined}
            onChange={(a: EverydayActivity) => {
              saveEnergy.mutate({ ...model.energy, everydayActivity: a });
              setEverydayAnswered(true);
            }}
          />
        </>
      ) : null}

      {shown === 'current' ? (
        <>
          <Text variant="heading">{t('bodyAddon.goal.currentTitle')}</Text>
          {hasTrend ? (
            <Card style={styles.card}>
              <Text variant="title" style={numeric}>
                {t('bodyAddon.progress.kg', { kg: model.trendKg })}
              </Text>
              <Text tone="secondary">{t('bodyAddon.goal.fromTrend')}</Text>
            </Card>
          ) : (
            <TextField
              label={t('bodyAddon.checkIn.weight')}
              suffix="kg"
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
            />
          )}
          <Button
            label={t('bodyAddon.goal.next')}
            disabled={parse(weight) === null && !hasTrend}
            onPress={() => setStep('target')}
          />
        </>
      ) : null}

      {step === 'target' ? (
        <>
          <Text variant="heading">{t('bodyAddon.goal.targetTitle')}</Text>
          <SegmentedControl
            options={[
              { value: 'change', label: t('bodyAddon.goal.change') },
              { value: 'maintain', label: t('bodyAddon.goal.kinds.maintain') },
            ]}
            value={maintain ? 'maintain' : 'change'}
            onChange={(v) => setMaintain(v === 'maintain')}
          />
          {maintain ? null : (
            <TextField
              label={t('bodyAddon.goal.targetWeight')}
              suffix="kg"
              keyboardType="decimal-pad"
              value={target}
              onChangeText={setTarget}
            />
          )}
          {!maintain && targetKg !== null ? (
            <Text tone="secondary">{t(`bodyAddon.goal.kinds.${kind}`)}</Text>
          ) : null}
          {issue && (maintain || targetKg !== null) ? (
            <Text testID="goal-issue">{t(`validation.${issue.code}`, { min: 18 })}</Text>
          ) : null}
          <Button
            label={t('bodyAddon.goal.next')}
            disabled={!(maintain || targetKg !== null) || issue !== null}
            onPress={() => setStep(kind === 'maintain' ? 'summary' : 'rate')}
          />
          <Button
            variant="secondary"
            label={t('bodyAddon.goal.back')}
            onPress={() => setStep('current')}
          />
        </>
      ) : null}

      {step === 'rate' ? (
        <>
          <Text variant="heading">{t('bodyAddon.goal.rateTitle')}</Text>
          {presets.map((preset) => (
            <View key={preset.key} style={styles.preset}>
              <Button
                variant="secondary"
                icon={usedRate === preset.rate ? 'check' : undefined}
                disabled={!preset.enabled}
                testID={`goal-preset-${preset.key}`}
                accessibilityState={{
                  selected: usedRate === preset.rate,
                  disabled: !preset.enabled,
                }}
                label={t('bodyAddon.goal.preset', {
                  name: t(`bodyAddon.goal.presets.${preset.key}`),
                  rate: preset.rate,
                })}
                onPress={() => setRate(preset.rate)}
              />
              {preset.enabled ? null : (
                <Text variant="caption" tone="secondary">
                  {t('bodyAddon.goal.aboveMax', { max: preset.maxRate })}
                </Text>
              )}
            </View>
          ))}
          <Slider
            testID="goal-rate-slider"
            label={t('bodyAddon.goal.custom')}
            value={usedRate}
            min={0.05}
            max={Math.max(0.05, maxRate)}
            step={0.05}
            onChange={(v) => setRate(customRate(v))}
            format={(v) => t('bodyAddon.goal.rate', { rate: v })}
          />
          {preview}
          <Button
            label={t('bodyAddon.goal.next')}
            disabled={belowFloor}
            onPress={() => setStep('summary')}
          />
          <Button
            variant="secondary"
            label={t('bodyAddon.goal.back')}
            onPress={() => setStep('target')}
          />
        </>
      ) : null}

      {step === 'summary' ? (
        <>
          <Text variant="heading">{t('bodyAddon.goal.summaryTitle')}</Text>
          <Card style={styles.card}>
            <Text>
              {kind === 'maintain'
                ? t('bodyAddon.goal.summaryMaintain', { kg: currentKg })
                : t('bodyAddon.goal.summaryChange', {
                    from: currentKg,
                    to: targetKg,
                    rate: targets.ratePerWeekKg,
                  })}
            </Text>
          </Card>
          {preview}
          <Button
            label={t('bodyAddon.goal.save')}
            disabled={!check.ok || belowFloor || saveGoal.isPending}
            onPress={() => void save()}
          />
          <Button
            variant="secondary"
            label={t('bodyAddon.goal.back')}
            onPress={() => setStep(kind === 'maintain' ? 'target' : 'rate')}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  preset: { gap: spacing.xs },
});
