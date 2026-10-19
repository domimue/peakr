import { findWorkout, type MoveWarning, type Plan } from '@peakr/engine';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Icon, spacing, Text, useTheme } from '@/ui';

import { formatDate, weekdayIndex } from '../calendar';
import { calendarTitle } from '../kind';
import type { MoveFeedback as Feedback } from '../plan-ui-store';

export interface MoveFeedbackProps {
  feedback: Feedback;
  plan: Plan;
  /** "Make the other day easier". */
  onEase: (ids: string[]) => void;
  /** Applies the rebalance suggestion. */
  onApply: () => void;
  /** Close / "Keep it anyway" – the move stays exactly as the user made it. */
  onDismiss: () => void;
}

function warningText(t: TFunction, w: MoveWarning, plan: Plan, language: string): string {
  const dates = w.dates.map((d) =>
    formatDate(d, language, { weekday: 'short', month: 'short', day: 'numeric' }),
  );
  const titles = w.workoutIds
    .map((id) => findWorkout(plan, id))
    .filter((x) => x !== undefined)
    .map((x) => calendarTitle(t, x));
  const first = w.dates[0];
  const day = first
    ? (t(`quiz.availability.weekdays.${weekdayIndex(first)}` as never) as string)
    : '';
  return t(`plan.feedback.rules.${w.code}` as never, {
    dates: dates.join(' / '),
    workouts: titles.join(', '),
    day,
  }) as string;
}

/**
 * After a move: the move always stands. Broken rules are shown as hints the user can close,
 * plus the engine's optional rebalance ("Apply") and "make the other day easier".
 */
export function MoveFeedbackCard({
  feedback,
  plan,
  onEase,
  onApply,
  onDismiss,
}: MoveFeedbackProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const date = (d: string) =>
    formatDate(d, i18n.language, { weekday: 'long', month: 'short', day: 'numeric' });
  const easeable = [...new Set(feedback.warnings.flatMap((w) => w.easeable))];
  const suggested = (feedback.suggestion?.moves ?? [])
    .map((m) => {
      const w = findWorkout(plan, m.id);
      return w
        ? t('plan.feedback.suggestionItem', { title: calendarTitle(t, w), date: date(m.to) })
        : null;
    })
    .filter((x) => x !== null);

  return (
    <Card
      testID="move-feedback"
      accessibilityLiveRegion="polite"
      style={feedback.warnings.length > 0 && { borderColor: colors.warning, borderWidth: 1.5 }}
    >
      <View style={styles.header}>
        <Icon name="move" size={18} color={colors.textMuted} />
        <Text style={[styles.strong, styles.flex]}>
          {t('plan.feedback.moved', { date: date(feedback.toDate) })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('plan.feedback.close')}
          hitSlop={12}
          onPress={onDismiss}
        >
          <Icon name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {feedback.warnings.map((w, i) => (
        <View key={`${w.code}-${i}`} style={styles.row}>
          <Icon name="warning" size={18} color={colors.warning} />
          <Text style={[styles.flex, { color: colors.warningText }]}>
            {warningText(t, w, plan, i18n.language)}
          </Text>
        </View>
      ))}

      {suggested.length > 0 ? (
        <View style={styles.row}>
          <Icon name="sparkles" size={18} color={colors.accentLine} />
          <Text style={styles.flex}>
            {t('plan.feedback.suggestion', { list: suggested.join(', ') })}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {suggested.length > 0 ? (
          <Button icon="sparkles" label={t('plan.feedback.apply')} onPress={onApply} />
        ) : null}
        {easeable.length > 0 ? (
          <Button
            icon="easy"
            variant={suggested.length > 0 ? 'secondary' : 'primary'}
            label={t('plan.feedback.ease')}
            onPress={() => onEase(easeable)}
          />
        ) : null}
        <Button variant="secondary" small label={t('plan.feedback.keep')} onPress={onDismiss} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  actions: { gap: spacing.sm },
});
