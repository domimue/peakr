import {
  difficultyLevel,
  previewDifficulty,
  SPORTS,
  type DifficultyChange,
  type PlanOutlook,
  type Sport,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { Button, Card, LinkRow, numeric, Screen, Slider, spacing, Text } from '@/ui';

import { issueText } from '../issue-text';
import { usePlan, usePlanActions } from '../queries';

/**
 * How hard the plan is, 1–10 (CLAUDE.md "Difficulty"): 5 is what the engine computes. A change
 * regenerates the coming weeks only – completed weeks stay – and every safety rule still holds.
 * Before applying, the screen shows what changes over the next four weeks.
 */
export function DifficultyScreen() {
  const { t } = useTranslation();
  const { data: stored } = usePlan();
  const actions = usePlanActions();
  const current = difficultyLevel(stored?.input.profile.difficulty);
  const [level, setLevel] = useState<number | null>(null);
  const chosen = level ?? current;
  const today = todayIso();

  const preview = useMemo(() => {
    if (!stored || chosen === current) return null;
    return previewDifficulty(stored.state, stored.input, today, chosen);
  }, [stored, chosen, current, today]);

  if (!stored) return <Screen />;

  return (
    <Screen>
      <Text tone="secondary">{t('plan.difficulty.intro')}</Text>
      <Slider
        label={t('plan.difficulty.label')}
        value={chosen}
        min={1}
        max={10}
        step={1}
        onChange={setLevel}
        format={(v) => t('plan.difficulty.value', { value: v })}
        testID="difficulty-slider"
      />
      <Text variant="caption" tone="secondary">
        {t(`plan.difficulty.hint.${chosen < 5 ? 'easier' : chosen > 5 ? 'harder' : 'neutral'}`)}
      </Text>

      {preview && !preview.ok ? <Text tone="danger">{issueText(t, preview.issues)}</Text> : null}
      {preview?.ok ? <Comparison change={preview.value} /> : null}

      <Button
        label={t('plan.difficulty.apply')}
        disabled={!preview?.ok}
        onPress={() => {
          if (!preview?.ok) return;
          const r = actions.applyDifficulty(preview.value);
          if (r.ok) router.back();
        }}
        testID="difficulty-apply"
      />
      <Text variant="caption" tone="secondary">
        {t('plan.difficulty.notARepair')}
      </Text>
      <LinkRow
        title={t('plan.difficulty.fixStart')}
        icon="tune"
        onPress={() => router.push('/training/baseline')}
      />
    </Screen>
  );
}

function Comparison({ change }: { change: DifficultyChange }) {
  const { t } = useTranslation();
  const { before, after } = change;
  const sports = SPORTS.filter(
    (s) => before.minutesPerWeek[s] !== undefined || after.minutesPerWeek[s] !== undefined,
  );
  const row = (label: string, a: string, b: string, testID?: string) => (
    <View style={styles.row} key={label} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <Text style={numeric}>{t('plan.difficulty.change', { before: a, after: b })}</Text>
    </View>
  );
  const minutes = (o: PlanOutlook, s: Sport) =>
    t('plan.difficulty.minutes', { value: o.minutesPerWeek[s] ?? 0 });
  const km = (o: PlanOutlook, s: Sport) => t('plan.difficulty.km', { value: o.kmPerWeek[s] ?? 0 });
  const longest = (o: PlanOutlook, s: Sport) =>
    t('plan.difficulty.minutes', { value: o.longestMin[s] ?? 0 });
  return (
    <Card testID="difficulty-preview">
      <Text variant="label">{t('plan.difficulty.preview', { weeks: after.weeks })}</Text>
      {row(
        t('plan.difficulty.sessions'),
        String(before.sessionsPerWeek),
        String(after.sessionsPerWeek),
        'difficulty-sessions',
      )}
      {sports.map((s) => (
        <View key={s} style={styles.sport}>
          <Text variant="caption" tone="secondary">
            {t(`activities.sport.${s}`)}
          </Text>
          {row(
            t('plan.difficulty.volume'),
            minutes(before, s),
            minutes(after, s),
            `difficulty-${s}-min`,
          )}
          {row(t('plan.difficulty.distance'), km(before, s), km(after, s))}
          {row(t('plan.difficulty.longest'), longest(before, s), longest(after, s))}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  label: { flexShrink: 1 },
  sport: { gap: spacing.xs, marginTop: spacing.sm },
});
