import { generatePlan, type PlanNote, type Workout } from '@peakr/engine';
import { buildForecast, prepareAnswers, toPlanInput, type ForecastLine } from '@peakr/quiz';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useBaselineStore } from '@/features/baseline/baseline-store';
import { calibrateOnboarding } from '@/features/baseline/calibration';
import { useSaveStrengthSetup } from '@/features/strength/queries';
import { planTargetBands } from '@/features/training-zones/resolve';
import { setupFromAnswers } from '@/features/strength/setup-form';
import {
  Badge,
  Button,
  Card,
  LinkRow,
  numeric,
  Reveal,
  Screen,
  spacing,
  Text,
  useTheme,
} from '@/ui';

import { LoadChart, PhaseStrip } from '../components/load-chart';
import { localToday, useQuizStore } from '../quiz-store';
import {
  durationText,
  exerciseLines,
  structureLines,
  targetText,
  workoutTitle,
} from '../workout-text';

/** Params that are ids get translated (race distances). */
function lineParams(t: (k: never) => string, line: ForecastLine | PlanNote) {
  const params: Record<string, string | number> = { ...line.params };
  for (const k of ['distance', 'reference'] as const) {
    if (typeof params[k] === 'string') params[k] = t(`races.${params[k]}` as never);
  }
  return params;
}

/**
 * Forecast after the quiz: plan length, phases, weekly load, the expected outcome (all from the
 * engine) and week 1 in full. The rest of the plan needs a subscription or trial.
 */
export function ForecastScreen() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => localToday(), []);
  const { hydrated, hydrate, answers: given } = useQuizStore();
  const baseline = useBaselineStore();
  const saveStrength = useSaveStrengthSetup();
  const saved = useRef(false);

  useEffect(() => {
    void hydrate();
    void useBaselineStore.getState().hydrate();
  }, [hydrate]);

  const { activities, meta } = baseline;
  const result = useMemo(() => {
    const input = toPlanInput(given, today);
    if (!input.ok) return null;
    // The Strava baseline (if the user gave one) calibrates levels, week 1, paces and zones.
    const v = calibrateOnboarding(input.value, { activities, meta }, today);
    const plan = generatePlan(v.profile, v.goal, v.availability, v.startDate, v.targetDate);
    // Below what the athlete already does: say why instead of a generic error.
    if (!plan.ok) return { issues: plan.issues.filter((i) => i.field === 'baseline') };
    return {
      input: v,
      plan: plan.value,
      forecast: buildForecast(plan.value, v, prepareAnswers(given, today)),
      hrZones: planTargetBands({ ...v, ...(v.targetDate ? { targetDate: v.targetDate } : {}) }),
    };
  }, [given, today, activities, meta]);

  // The strength answers become the saved setup (Profile → Strength edits it).
  useEffect(() => {
    if (!result || 'issues' in result || saved.current) return;
    saved.current = true;
    saveStrength.mutate(setupFromAnswers(prepareAnswers(given, today)));
  }, [given, result, saveStrength, today]);

  if (!hydrated) return <Screen />;
  if (!result || 'issues' in result) {
    const issue = result?.issues?.[0];
    return (
      <Screen title={t('quiz.forecast.title')}>
        <Text testID="forecast-error">
          {issue ? t(`validation.${issue.code}`, issue.params ?? {}) : t('quiz.forecast.error')}
        </Text>
        <Button
          label={t('quiz.forecast.editAnswers')}
          onPress={() => router.replace('/onboarding/quiz')}
        />
      </Screen>
    );
  }

  const { forecast, plan, input, hrZones } = result;
  const date = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, { dateStyle: 'medium' });
  const week1 = plan.weeks[0];

  return (
    <Screen title={t('quiz.forecast.title')}>
      <Reveal>
        <Text tone="secondary">
          {t(`quiz.goal.options.${input.goal.kind}.label` as never) as string}
        </Text>
        <View style={styles.stats}>
          <Stat value={String(forecast.weeks)} label={t('quiz.forecast.weeks')} />
          <Stat value={String(forecast.sessions)} label={t('quiz.forecast.sessions')} />
          <Stat value={String(forecast.recoveryWeeks)} label={t('quiz.forecast.recoveryWeeks')} />
        </View>
        <Text variant="caption" tone="secondary">
          {t('quiz.forecast.dates', {
            start: date(forecast.startDate),
            end: date(forecast.endDate),
          })}
        </Text>

        <Card>
          <Text variant="heading">{t('quiz.forecast.loadTitle')}</Text>
          <Text variant="caption" tone="secondary">
            {t('quiz.forecast.loadHint')}
          </Text>
          <LoadChart weeks={forecast.loads} maxLoad={forecast.maxLoad} />
          <PhaseStrip phases={forecast.phases} weeks={forecast.weeks} />
        </Card>

        <Card>
          <Text variant="heading">{t('quiz.forecast.outcomeTitle')}</Text>
          {forecast.outcome.map((line) => (
            <Text
              key={line.key}
            >{`•  ${t(line.key as never, lineParams(t, line)) as string}`}</Text>
          ))}
          {forecast.notes.map((note) => (
            <Text key={note.key} variant="caption" tone="secondary">
              {`ⓘ ${t(note.key as never, lineParams(t, note)) as string}`}
            </Text>
          ))}
          <Text variant="caption" tone="secondary">
            {t('quiz.forecast.basis')}
          </Text>
        </Card>

        {week1 ? (
          <View style={styles.week}>
            <Text variant="heading" accessibilityRole="header">
              {t('quiz.forecast.week1Title')}
            </Text>
            {week1.workouts.map((w) => (
              <WorkoutCard key={w.id} workout={w} hrZones={hrZones} date={date(w.date)} />
            ))}
          </View>
        ) : null}

        {input.strengthRoutinesPending ? (
          <LinkRow
            title={t('quiz.forecast.buildRoutines')}
            hint={t('quiz.forecast.buildRoutinesHint')}
            onPress={() => router.push({ pathname: '/gym/routines/[id]', params: { id: 'new' } })}
          />
        ) : null}

        <Card>
          <Text style={styles.strong}>
            {t('quiz.forecast.lockedTitle', { weeks: forecast.weeks - 1 })}
          </Text>
          <Text tone="secondary">{t('quiz.forecast.trial')}</Text>
          <Button label={t('quiz.forecast.unlock')} onPress={() => router.push('/paywall')} />
        </Card>
        <Button
          variant="secondary"
          label={t('quiz.forecast.editAnswers')}
          onPress={() => router.replace('/onboarding/quiz')}
        />
      </Reveal>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.stat}>
      <Text variant="title" style={numeric}>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </Card>
  );
}

function WorkoutCard({
  workout: w,
  hrZones,
  date,
}: {
  workout: Workout;
  hrZones: Parameters<typeof targetText>[2];
  date: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lines = w.sport === 'strength' ? exerciseLines(t, w) : structureLines(t, w);
  return (
    <Card accessibilityLabel={`${date}: ${workoutTitle(t, w)}`}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="caption" tone="secondary">
            {date}
          </Text>
          <Text style={styles.strong}>{workoutTitle(t, w)}</Text>
        </View>
        {w.hard ? <Badge label={t('quiz.forecast.hard')} /> : null}
      </View>
      <Text>
        {w.sport === 'strength'
          ? durationText(t, w)
          : `${durationText(t, w)} · ${targetText(t, w.target, hrZones)}`}
      </Text>
      <View style={[styles.lines, { borderLeftColor: colors.border }]}>
        {lines.map((line, i) => (
          <Text key={i} variant="caption">
            {line}
          </Text>
        ))}
      </View>
      <Text variant="caption" tone="secondary">
        {t(w.whyKey as never) as string}
      </Text>
      {w.notes.map((note, i) => (
        <Text key={`${note.key}-${i}`} variant="caption" tone="secondary">
          {`ⓘ ${t(note.key as never, { ...note.params }) as string}`}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', gap: 0 },
  week: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  lines: { borderLeftWidth: 2, paddingLeft: spacing.sm, gap: 2 },
});
