import { formatDuration, type Block, type HrZone, type Step } from '@peakr/engine';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, radius, spacing, Text, type IconName } from '@/ui';

import { targetText } from '../../onboarding/workout-text';

/** Steps of a session as the workout screen and Today show them (CLAUDE.md "Workout detail"). */

export interface StepItem {
  key: string;
  title: string;
  target: string;
  explanation: string;
}

function amountText(t: TFunction, s: Step): string {
  if (s.distanceM !== undefined) return t('workoutText.meters', { value: s.distanceM });
  const sec = s.durationSec ?? 0;
  return sec % 60 === 0 ? t('workoutText.minutes', { count: sec / 60 }) : formatDuration(sec);
}

/**
 * Numbered steps: every warm-up and cool-down step, every main block (repeats as one step with
 * the work and recovery inside). Each with its target and one line of explanation.
 */
export function stepItems(
  t: TFunction,
  parts: { warmup: Step[]; main: Block[]; cooldown: Step[] },
  hrZones: readonly HrZone[],
  paceLimit: string | null,
): StepItem[] {
  const target = (s: Step) => {
    const main = targetText(t, s.target, hrZones);
    return paceLimit && s.zone <= 2
      ? t('workout.paceLimit', { target: main, pace: paceLimit })
      : main;
  };
  const explain = (s: Step, fallback: string) =>
    s.noteKey ? (t(s.noteKey as never) as string) : fallback;
  const items: StepItem[] = [];
  parts.warmup.forEach((s, i) =>
    items.push({
      key: `w${i}`,
      title: `${t('workout.step.warmup')} · ${amountText(t, s)}`,
      target: target(s),
      explanation: explain(s, t('workout.explain.warmup')),
    }),
  );
  parts.main.forEach((b, i) => {
    const work = b.steps.find((s) => !s.rest) ?? b.steps[0];
    const rest = b.steps.find((s) => s.rest);
    if (!work) return;
    const amount =
      b.repeat > 1
        ? t('workout.repeat', {
            count: b.repeat,
            work: amountText(t, work),
            rest: rest ? amountText(t, rest) : '',
          })
        : amountText(t, work);
    items.push({
      key: `m${i}`,
      title: `${t('workout.step.main')} · ${amount}`,
      target: target(work),
      explanation: explain(
        work,
        b.repeat > 1 ? t('workout.explain.repeat') : t(`workout.explain.zone${work.zone}`),
      ),
    });
  });
  parts.cooldown.forEach((s, i) =>
    items.push({
      key: `c${i}`,
      title: `${t('workout.step.cooldown')} · ${amountText(t, s)}`,
      target: target(s),
      explanation: explain(s, t('workout.explain.cooldown')),
    }),
  );
  return items;
}

export interface NumberedRowProps {
  n: number;
  color: string;
  title: string;
  target?: string;
  explanation?: string;
}

export function NumberedRow({ n, color, title, target, explanation }: NumberedRowProps) {
  return (
    <View style={styles.step} accessible testID={`step-${n}`}>
      <View style={[styles.stepNumber, { borderColor: color }]}>
        <Text variant="label">{n}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.strong}>{title}</Text>
        {target ? <Text>{target}</Text> : null}
        {explanation ? (
          <Text variant="caption" tone="secondary">
            {explanation}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface SectionProps {
  icon: IconName;
  title: string;
  /** Icon colour (the workout's type colour). */
  color: string;
  children: ReactNode;
}

export function Section({ icon, title, color, children }: SectionProps) {
  return (
    <Card>
      <View style={styles.inline}>
        <Icon name={icon} size={18} color={color} />
        <Text variant="label">{title}</Text>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  stepNumber: {
    minWidth: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
