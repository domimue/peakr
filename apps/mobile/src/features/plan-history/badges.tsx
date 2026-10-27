import { planBadges, type Badge } from '@peakr/engine';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ArchivedPlan } from '@/data/repositories/plan-repository';
import { PeakrMark, radius, spacing, Text, useTheme } from '@/ui';

import { formatDate } from '../plan/calendar';

export function goalName(t: TFunction, goal: string): string {
  return t(`quiz.goal.options.${goal}.label` as never) as string;
}

export function badgeTitle(t: TFunction, badge: Badge, language: string): string {
  if (badge.kind !== 'plan') return t(`planHistory.badges.${badge.kind}`);
  const month = formatDate(`${badge.month}-01`, language, { month: 'short', year: 'numeric' });
  return t('planHistory.badges.plan', { goal: goalName(t, badge.goal), month });
}

/**
 * Badges for completed plans (CLAUDE.md "Plan history"): our own mark, no streaks, nothing about
 * weight or food. Only plans that ran through all their weeks with ≥ 80 % done earn one.
 */
export function BadgeShelf({ archived }: { archived: readonly ArchivedPlan[] }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const badges = planBadges(archived);
  if (badges.length === 0) return null;
  return (
    <View style={styles.shelf} testID="badges">
      {badges.map((b) => {
        const title = badgeTitle(t, b, i18n.language);
        return (
          <View
            key={`${b.planId}-${b.kind}`}
            accessible
            accessibilityLabel={title}
            style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID={`badge-${b.planId}-${b.kind}`}
          >
            <PeakrMark size={28} color={b.kind === 'plan' ? colors.text : colors.accent} />
            <Text variant="caption" style={styles.title}>
              {title}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    width: 104,
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { textAlign: 'center' },
});
