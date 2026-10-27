import {
  paceLimitSecPerKm,
  workoutKind,
  type HrZone,
  type UserProfile,
  type Workout,
  type WorkoutStatus,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useRoute } from '@/features/routes/queries';
import { paceText, useUnits } from '@/features/settings/units';
import { Badge, Button, Card, IconBadge, radius, spacing, Text, useTheme } from '@/ui';

import { durationText, exerciseLines, targetText, workoutTitle } from '../onboarding/workout-text';
import { calendarTitle, kindIcon, typeColor, typeName } from '../plan/kind';
import { NumberedRow, Section, stepItems } from '../plan/components/workout-steps';

export const workoutHref = (id: string) => `/training/workout/${encodeURIComponent(id)}` as const;

export interface DaySessionProps {
  workout: Workout;
  status: WorkoutStatus;
  profile: UserProfile;
  hrZones: readonly HrZone[];
  /** Done can be marked on the day and afterwards, with an active subscription. */
  canMarkDone: boolean;
  onMarkDone: () => void;
}

/**
 * One session of the day Today shows (CLAUDE.md "UI patterns → Today"): everything needed to do
 * it without opening anything – type and title in the type colour, the duration range, the target
 * heart-rate band in bpm, the route, the numbered steps and why it is in the plan.
 */
export function DaySession({
  workout: w,
  status,
  profile,
  hrZones,
  canMarkDone,
  onMarkDone,
}: DaySessionProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { units, distance } = useUnits();
  const color = typeColor(colors, w);
  const routable = w.sport === 'run' || w.sport === 'bike';
  const { data: route } = useRoute(w.routeId);
  const limit = paceLimitSecPerKm(w, profile);
  const steps =
    w.sport === 'strength'
      ? []
      : stepItems(t, w, hrZones, limit === null ? null : paceText(units, limit));
  const title = calendarTitle(t, w);

  return (
    <View style={styles.stack} testID={`day-session-${w.id}`}>
      <Card style={styles.head}>
        <View style={[styles.bar, { backgroundColor: color }]} />
        <View style={styles.row}>
          <IconBadge name={kindIcon(workoutKind(w))} color={color} size={44} />
          <View style={styles.flex}>
            <Text variant="caption" tone="secondary">
              {typeName(t, w.type)}
            </Text>
            <Text variant="heading">{title}</Text>
          </View>
          {status !== 'planned' ? <Badge label={t(`plan.status.${status}`)} /> : null}
        </View>
        <Text style={styles.strong}>{durationText(t, w)}</Text>
        {w.sport === 'strength' ? null : (
          <Text testID="day-target">{targetText(t, w.target, hrZones)}</Text>
        )}
        {routable ? (
          <Text tone="secondary" testID="day-route">
            {route
              ? t('today.route', {
                  name: route.name,
                  distance: distance(route.distanceM / 1000),
                  gain: Math.round(route.gainM),
                })
              : t('today.freeSession')}
          </Text>
        ) : null}
      </Card>

      <Section
        icon="structure"
        color={color}
        title={w.sport === 'strength' ? t('plan.workout.exercises') : t('workout.steps')}
      >
        {w.sport === 'strength'
          ? exerciseLines(t, w).map((line, i) => (
              <NumberedRow key={i} n={i + 1} color={color} title={line} />
            ))
          : steps.map((s, i) => (
              <NumberedRow
                key={s.key}
                n={i + 1}
                color={color}
                title={s.title}
                target={s.target}
                explanation={s.explanation}
              />
            ))}
      </Section>
      <Section icon="why" color={color} title={t('plan.workout.why')}>
        <Text>{t(w.whyKey as never) as string}</Text>
      </Section>

      <View style={styles.actions}>
        {canMarkDone && status === 'planned' ? (
          <Button label={t('today.markDone')} icon="check" onPress={onMarkDone} />
        ) : null}
        <Button
          variant="secondary"
          label={t('today.openSession')}
          accessibilityLabel={`${t('today.openSession')}: ${workoutTitle(t, w)}`}
          onPress={() => router.push(workoutHref(w.id))}
        />
        {routable ? (
          <Button
            variant="secondary"
            small
            icon="route"
            label={route ? t('today.changeRoute') : t('today.chooseRoute')}
            onPress={() => router.push(`/training/route/${encodeURIComponent(w.id)}`)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  head: { overflow: 'hidden', paddingTop: spacing.md + 4, borderRadius: radius.md },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  actions: { gap: spacing.sm },
});
