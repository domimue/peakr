import {
  activityKeys,
  evaluateActivity,
  formatDuration,
  mainSetFlatPace,
  routePacePlan,
  estimateSessionOnRouteSec,
  type Activity,
  type HrZone,
  type UserProfile,
  type Workout,
  type ZoneNumber,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { targetText, zoneNumber } from '@/features/onboarding/workout-text';
import { Card, spacing, StatTile, Text } from '@/ui';

import { useRoute, useStreams } from '../queries';
import { ElevationChart } from './elevation-chart';
import { EvaluationTable, PaceTable } from './pace-table';
import { RouteMap } from './route-map';

/** Expected duration on a route as a ±5 % range rounded to 5 min ("50–55 min"). */
function durationRangeText(sec: number): { min: number; max: number } {
  const min = Math.max(5, Math.floor((sec * 0.95) / 300) * 5);
  return { min, max: Math.max(min + 5, Math.ceil((sec * 1.05) / 300) * 5) };
}

export interface WorkoutRouteProps {
  workout: Workout;
  profile: UserProfile;
  hrZones: readonly HrZone[];
  color: string;
}

/**
 * The route chosen for a session (CLAUDE.md "Terrain intelligence" user flow): map, elevation
 * profile, expected duration and – for runs – the per-km pace plan.
 */
export function WorkoutRoute({ workout: w, profile, hrZones, color }: WorkoutRouteProps) {
  const { t } = useTranslation();
  const { data: route } = useRoute(w.routeId);
  const sport = w.sport === 'bike' ? 'bike' : 'run';
  const plan = useMemo(
    () => (route && sport === 'run' ? routePacePlan(w, route.profile, profile) : null),
    [route, sport, w, profile],
  );
  if (!w.routeId || !route) return null;
  const expected = durationRangeText(estimateSessionOnRouteSec(w, sport, route.profile, profile));
  return (
    <Card testID="workout-route">
      <Text variant="label" accessibilityRole="header">
        {route.name}
      </Text>
      <RouteMap polyline={route.polyline} color={color} height={200} />
      <View style={styles.tiles}>
        <StatTile
          value={t('routes.choose.durationRange', expected)}
          label={t('routes.choose.expectedLabel')}
        />
        <StatTile
          value={t('plan.km', { value: Math.round(route.distanceM / 100) / 10 })}
          label={t('routes.stats.distance')}
        />
        <StatTile
          value={t('routes.meters', { value: route.gainM })}
          label={t('routes.stats.gain')}
        />
      </View>
      <ElevationChart
        profile={route.profile}
        color={color}
        gainM={route.gainM}
        lossM={route.lossM}
      />
      {plan ? <PaceTable segments={plan} hrTarget={targetText(t, w.target, hrZones)} /> : null}
      <Text
        variant="caption"
        tone="secondary"
        accessibilityRole="link"
        onPress={() => router.push(`/routes/${encodeURIComponent(route.id)}`)}
      >
        {t('routes.choose.openRoute')}
      </Text>
    </Card>
  );
}

export interface WorkoutEvaluationProps {
  workout: Workout;
  activity: Activity;
  profile: UserProfile;
  hrZones: readonly HrZone[];
}

/** Grade-adjusted evaluation once the activity synced with its streams (CLAUDE.md §8). */
export function WorkoutEvaluation({
  workout: w,
  activity,
  profile,
  hrZones,
}: WorkoutEvaluationProps) {
  const { t } = useTranslation();
  const { data: streams } = useStreams();
  const sport = activity.sport === 'bike' ? 'bike' : activity.sport === 'run' ? 'run' : null;
  const evaluation = useMemo(() => {
    if (!sport) return null;
    const keys = new Set(activityKeys(activity));
    const stream = (streams ?? []).find((s) => keys.has(`${s.source}:${s.externalId}`));
    if (!stream) return null;
    return evaluateActivity(sport, stream.data, {
      plan:
        sport === 'run' && w.sport === 'run'
          ? { flatPaceSecPerKm: mainSetFlatPace(w, profile), pacePrimary: w.paceMode === 'target' }
          : null,
      targetZone: zoneNumber(w.target) as ZoneNumber | null,
      hrZones,
    });
  }, [sport, activity, streams, w, profile, hrZones]);
  if (!evaluation || !sport) return null;
  const figures = [
    t('routes.eval.elevation', { gain: evaluation.gainM, loss: evaluation.lossM }),
    evaluation.gapSecPerKm !== null
      ? t('routes.eval.gapTotal', { pace: formatDuration(evaluation.gapSecPerKm) })
      : null,
    evaluation.timeInZoneShare !== null
      ? t('routes.eval.inZone', { share: Math.round(evaluation.timeInZoneShare * 100) })
      : null,
  ].filter(Boolean) as string[];
  return (
    <Card testID="workout-evaluation">
      <Text variant="label" accessibilityRole="header">
        {t('routes.eval.title')}
      </Text>
      {figures.map((f) => (
        <Text key={f} variant="caption">
          {f}
        </Text>
      ))}
      {evaluation.km.length > 0 ? <EvaluationTable km={evaluation.km} sport={sport} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
});
