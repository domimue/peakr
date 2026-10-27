import { changeTone, type CoachAdjustment, type CoachSummary } from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AddonGuard } from '@/features/billing/model';
import { Button, Card, Icon, spacing, StatTile, Text, TileGrid, useTheme } from '@/ui';

import type { BodyModel } from '../model';
import { useSaveGoal } from '../queries';

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** At most this many one-line takeaways (CLAUDE.md "UI patterns → Body"). */
const MAX_TAKEAWAYS = 3;

function adjustmentText(t: TFunction, a: CoachAdjustment): string {
  switch (a.kind) {
    case 'kcal':
      return t(`bodyAddon.coach.adjust.kcal.${a.reason}`, { kcal: signed(a.kcal) });
    case 'protein':
      return t('bodyAddon.coach.adjust.protein', { grams: a.grams });
    case 'strength':
      return t('bodyAddon.coach.adjust.strength', { count: a.sessions });
    case 'logging':
      return t('bodyAddon.coach.adjust.logging', { days: a.days });
  }
}

interface Takeaway {
  key: string;
  tone: 'good' | 'watch';
  text: string;
}

/** One good sign first, then what to watch, then the other good signs – three at most. */
function takeaways(t: TFunction, coach: CoachSummary): Takeaway[] {
  const good = coach.wentWell.map<Takeaway>((p) => ({
    key: `well-${p.key}`,
    tone: 'good',
    text: t(`bodyAddon.coach.well.${p.key}`, p as Record<string, unknown>),
  }));
  const watch = coach.watch.map<Takeaway>((p) => ({
    key: `watch-${p.key}`,
    tone: 'watch',
    text: t(
      p.key === 'fastPace' && p.rate === null
        ? 'bodyAddon.coach.watchItem.fastPaceNoRate'
        : `bodyAddon.coach.watchItem.${p.key}`,
      p as Record<string, unknown>,
    ),
  }));
  return [...good.slice(0, 1), ...watch, ...good.slice(1)].slice(0, MAX_TAKEAWAYS);
}

/**
 * The weekly coach (in Nutrition, since it looks at energy and food): a row of last week's
 * figures, up to three one-line takeaways, and – folded away – the adjustments for this week and
 * the hints. With too little logged it says so in one sentence and offers the one thing that
 * helps. The engine picks every item; this card only words them. A kcal suggestion is applied
 * only when the user taps it.
 */
export function CoachCard({
  coach,
  model,
  guard,
}: {
  coach: CoachSummary;
  model: BodyModel;
  guard: AddonGuard;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const saveGoal = useSaveGoal();
  const [open, setOpen] = useState(false);
  const goal = model.goal;
  const w = coach.lastWeek;
  const date = new Date(`${coach.week}T12:00:00`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const apply = (kcal: number) => {
    if (!goal) return;
    const { id: _id, createdAt: _at, ...rest } = goal;
    saveGoal.mutate({ ...rest, adjustmentKcal: goal.adjustmentKcal + kcal, reason: 'adaptive' });
  };

  const header = (
    <View style={styles.row}>
      <Icon name="sparkles" size={20} color={colors.textMuted} />
      <View style={styles.flex}>
        <Text variant="heading" accessibilityRole="header">
          {t('bodyAddon.coach.title')}
        </Text>
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.coach.week', { date })}
        </Text>
      </View>
    </View>
  );

  if (coach.dataState === 'thin') {
    return (
      <Card style={styles.stack} testID="body-coach">
        {header}
        <Text testID="coach-thin">{t('bodyAddon.coach.thin.body')}</Text>
        {guard.canWrite ? (
          <Button
            small
            variant="secondary"
            icon="plus"
            label={t('bodyAddon.coach.thin.action')}
            onPress={() => router.push('/body/food/add')}
          />
        ) : null}
      </Card>
    );
  }

  const goalKind = goal && !goal.paused ? goal.kind : null;
  const trendTone = changeTone('weight', goalKind, w.trendChangeKg);
  const lines = takeaways(t, coach);

  return (
    <Card style={styles.stack} testID="body-coach">
      {header}

      <TileGrid testID="coach-numbers">
        {w.trendChangeKg !== null ? (
          <StatTile
            label={t('bodyAddon.coach.stats.trend')}
            value={t('bodyAddon.progress.kg', { kg: signed(w.trendChangeKg) })}
            // Towards or away from the goal is only said when there is one.
            context={goalKind ? t(`bodyAddon.coach.stats.tone.${trendTone}`) : undefined}
            tone={goalKind ? trendTone : undefined}
          />
        ) : null}
        <StatTile
          label={t('bodyAddon.coach.stats.logged')}
          value={t('bodyAddon.coach.stats.days', { days: w.loggedDays })}
          context={t('bodyAddon.coach.stats.weighIns', { count: w.weighInDays })}
        />
        {w.avgIntakeKcal !== null ? (
          <StatTile
            label={t('bodyAddon.coach.stats.intake')}
            value={t('bodyAddon.kcal', { kcal: w.avgIntakeKcal })}
            context={
              w.avgBalanceKcal !== null
                ? t('bodyAddon.coach.stats.balance', { kcal: signed(w.avgBalanceKcal) })
                : undefined
            }
          />
        ) : null}
        {w.sessionsPlanned !== null ? (
          <StatTile
            label={t('bodyAddon.coach.stats.training')}
            value={t('bodyAddon.coach.stats.sessions', {
              done: w.sessionsDone,
              planned: w.sessionsPlanned,
            })}
          />
        ) : null}
      </TileGrid>

      {lines.length > 0 ? (
        <View style={styles.tight} testID="coach-takeaways">
          {lines.map((l) => (
            <View
              key={l.key}
              style={styles.line}
              accessible
              accessibilityLabel={`${t(`bodyAddon.coach.tone.${l.tone}`)}: ${l.text}`}
              testID={`coach-${l.key}`}
            >
              <Icon
                name={l.tone === 'good' ? 'check' : 'info'}
                size={18}
                color={l.tone === 'good' ? colors.changeFavourable : colors.warning}
              />
              <Text style={styles.flex}>{l.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.toggle}
        testID="coach-toggle"
      >
        <Text variant="label" style={styles.flex}>
          {t('bodyAddon.coach.nextWeek')}
        </Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <View style={styles.stack} testID="coach-adjustments">
          {coach.adjustments.length === 0 ? (
            <Text tone="secondary">{t('bodyAddon.coach.noChanges')}</Text>
          ) : (
            coach.adjustments.map((a) => (
              <View key={a.kind} style={styles.tight}>
                <Text>{adjustmentText(t, a)}</Text>
                {/* The check-in suggestion has its button on the goal card in Body. */}
                {a.kind === 'kcal' && a.reason !== 'checkIn' && goal && guard.canWrite ? (
                  <Button
                    small
                    variant="secondary"
                    testID="coach-apply-kcal"
                    label={t('bodyAddon.goal.apply', { kcal: signed(a.kcal) })}
                    onPress={() => apply(a.kcal)}
                  />
                ) : null}
                {a.kind === 'strength' ? (
                  <Button
                    small
                    variant="secondary"
                    label={t('bodyAddon.coach.openPlan')}
                    onPress={() => router.push('/plan')}
                  />
                ) : null}
              </View>
            ))
          )}
          {coach.hints.map((h) => (
            <Text key={h} variant="caption" tone="secondary" testID={`coach-hint-${h}`}>
              {t(`bodyAddon.coach.hint.${h}`)}
            </Text>
          ))}
          <Text variant="caption" tone="secondary">
            {t('bodyAddon.coach.footer')}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  tight: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  flex: { flex: 1 },
});
