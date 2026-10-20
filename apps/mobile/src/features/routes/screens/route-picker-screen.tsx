import {
  findWorkout,
  formatDuration,
  rankRoutes,
  type MatchableRoute,
  type RouteMatch,
  type Workout,
} from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StoredRoute } from '@/data/repositories/route-repository';
import { usePlan, usePlanActions } from '@/features/plan/queries';
import { Button, Icon, ListState, radius, Screen, spacing, Text, useTheme } from '@/ui';

import { gainPerKm } from '../import';
import { useRoutes } from '../queries';
import { RouteRow } from './route-library-screen';

const OPTIONS = 3;

export function matchable(r: StoredRoute): MatchableRoute {
  return {
    id: r.id,
    sport: r.sport,
    distanceM: r.distanceM,
    gainPerKm: gainPerKm(r),
    profile: r.profile,
    start: r.start,
  };
}

function matchText(t: TFunction, m: RouteMatch): string {
  const reasons = m.reasons.map((r) => t(`routes.choose.reason.${r}`));
  return [
    t('routes.choose.expected', { duration: formatDuration(m.durationSec) }),
    ...reasons,
  ].join(' · ');
}

/**
 * "Choose route" for a run or ride (CLAUDE.md "Terrain intelligence" user flow): the best of the
 * user's own routes, the best recognised routes and the free session (time + HR only).
 */
export function RoutePickerScreen({ workoutId }: { workoutId: string }) {
  const { t } = useTranslation();
  const { data: stored } = usePlan();
  const { data: routes, isPending } = useRoutes();
  const actions = usePlanActions();
  const w = stored ? findWorkout(stored.state.plan, workoutId) : undefined;

  if (isPending || !stored) {
    return (
      <Screen>
        <ListState kind="loading" label={t('common.loading')} />
      </Screen>
    );
  }
  if (!w) {
    return (
      <Screen>
        <ListState kind="empty" icon="route" title={t('plan.workout.notFound')} />
      </Screen>
    );
  }

  const choose = (routeId: string | null) => {
    if (actions.setRoute(w.id, routeId).ok) router.back();
  };
  const all = routes ?? [];
  const byId = new Map(all.map((r) => [r.id, r]));
  // The user's start point is not known yet (no location permission): start distance is ignored.
  const rank = (list: StoredRoute[]) =>
    rankRoutes(list.map(matchable), w, stored.input.profile, null, OPTIONS);
  const own = rank(all.filter((r) => r.source !== 'strava'));
  const recognised = rank(all.filter((r) => r.source === 'strava'));

  return (
    <Screen>
      <Text tone="secondary">{t('routes.choose.intro')}</Text>
      <Group
        title={t('routes.choose.own')}
        matches={own}
        byId={byId}
        selected={w.routeId}
        onChoose={choose}
        empty={t('routes.choose.noOwn')}
      />
      <Group
        title={t('routes.choose.recognised')}
        matches={recognised}
        byId={byId}
        selected={w.routeId}
        onChoose={choose}
        empty={t('routes.choose.noRecognised')}
      />
      <FreeSession w={w} onChoose={() => choose(null)} />
      <Button
        variant="secondary"
        label={t('routes.choose.library')}
        icon="route"
        onPress={() => router.push('/routes')}
      />
    </Screen>
  );
}

function Group({
  title,
  matches,
  byId,
  selected,
  onChoose,
  empty,
}: {
  title: string;
  matches: RouteMatch[];
  byId: Map<string, StoredRoute>;
  selected: string | undefined;
  onChoose: (id: string) => void;
  empty: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.gap}>
      <Text variant="label" accessibilityRole="header">
        {title}
      </Text>
      {matches.length === 0 ? (
        <Text variant="caption" tone="secondary">
          {empty}
        </Text>
      ) : (
        matches.map((m) => {
          const route = byId.get(m.routeId) as StoredRoute;
          const chosen = selected === m.routeId;
          return (
            <RouteRow
              key={m.routeId}
              route={route}
              detail={`${chosen ? `${t('routes.choose.selected')} · ` : ''}${matchText(t, m)}`}
              onPress={() => onChoose(m.routeId)}
              testID={`choose-${m.routeId}`}
            />
          );
        })
      )}
    </View>
  );
}

function FreeSession({ w, onChoose }: { w: Workout; onChoose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const chosen = w.routeId === undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      onPress={onChoose}
      style={({ pressed }) => [
        styles.free,
        {
          backgroundColor: pressed ? colors.surface2 : colors.surface,
          borderColor: chosen ? colors.accentLine : colors.border,
        },
      ]}
      testID="choose-free"
    >
      <Icon name="heart" size={20} color={colors.text} />
      <View style={styles.flex}>
        <Text style={styles.strong}>{t('routes.choose.free')}</Text>
        <Text variant="caption" tone="secondary">
          {t('routes.choose.freeHint')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  free: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  flex: { flex: 1, gap: 2 },
  strong: { fontWeight: '500' },
});
