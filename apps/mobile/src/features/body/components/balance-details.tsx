import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, numeric, spacing, Text, useTheme } from '@/ui';

import type { BodyModel } from '../model';

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
/** A kcal figure with its sign (− for a deficit). */
export const signedKcal = (n: number) => `${sign(Math.round(n))}${Math.abs(Math.round(n))}`;
const signedKg = (kg: number) => `${sign(Math.round(kg * 100))}${Math.abs(kg).toFixed(2)}`;

const short = (iso: string, language: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(language, { day: 'numeric', month: 'short' });

/**
 * The measured balance since the goal started against what the goal planned, and the last 14
 * days one by one (eaten, burnt, balance; days not counted are labelled). Numbers come from the
 * engine; every figure is an estimate.
 */
export function BalanceSinceGoal({ balance }: { balance: BodyModel['balance'] }) {
  const { t, i18n } = useTranslation();
  const s = balance.sinceGoal;
  if (!s) return null;
  if (s.countedDays === 0) {
    return (
      <View style={styles.tight} testID="balance-since-goal">
        <Text variant="label">
          {t('bodyAddon.balance.sinceGoal', { date: short(s.from, i18n.language) })}
        </Text>
        <Text tone="secondary">{t('bodyAddon.balance.sinceGoalEmpty')}</Text>
      </View>
    );
  }
  const ahead = s.plannedKcal === null ? null : s.plannedKcal - s.balanceKcal;
  return (
    <View style={styles.tight} testID="balance-since-goal">
      <Text variant="label">
        {t('bodyAddon.balance.sinceGoal', { date: short(s.from, i18n.language) })}
      </Text>
      <Text variant="title" style={numeric}>
        {t('bodyAddon.balance.kcal', { kcal: signedKcal(s.balanceKcal) })}
      </Text>
      <Text tone="secondary" style={numeric}>
        {t('bodyAddon.balance.sinceGoalLine', {
          kg: signedKg(s.fatKg),
          count: s.countedDays,
        })}
      </Text>
      {s.plannedKcal !== null && ahead !== null ? (
        <Text style={numeric} testID="balance-vs-plan">
          {t(
            ahead > 0
              ? 'bodyAddon.balance.ahead'
              : ahead < 0
                ? 'bodyAddon.balance.behind'
                : 'bodyAddon.balance.onPlan',
            { planned: signedKcal(s.plannedKcal), kcal: Math.abs(Math.round(ahead)) },
          )}
        </Text>
      ) : null}
    </View>
  );
}

export function BalanceDays({ days }: { days: BodyModel['balance']['days'] }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  if (days.length === 0) return null;
  return (
    <View style={styles.tight}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.toggle}
        testID="balance-days-toggle"
      >
        <Text variant="label" style={styles.flex}>
          {t('bodyAddon.balance.days')}
        </Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View testID="balance-days">
          {days.map((d) => (
            <View
              key={d.day}
              style={[styles.row, { borderBottomColor: colors.border }]}
              testID={`balance-day-${d.day}`}
            >
              <View style={styles.flex}>
                <Text>{short(d.day, i18n.language)}</Text>
                <Text variant="caption" tone="secondary" style={numeric}>
                  {d.intakeKcal === null
                    ? t('bodyAddon.balance.dayBurnt', { burnt: d.restingKcal + d.activeKcal })
                    : t('bodyAddon.balance.dayLine', {
                        eaten: d.intakeKcal,
                        burnt: d.restingKcal + d.activeKcal,
                      })}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={numeric}>{d.balanceKcal === null ? '–' : signedKcal(d.balanceKcal)}</Text>
                {!d.counted ? (
                  <Text variant="caption" tone="secondary">
                    {t(
                      d.intakeKcal === null
                        ? 'bodyAddon.balance.notLogged'
                        : 'bodyAddon.balance.notCounted',
                    )}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          <Text variant="caption" tone="secondary">
            {t('bodyAddon.balance.daysHint')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tight: { gap: spacing.xs },
  flex: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  right: { alignItems: 'flex-end' },
});
