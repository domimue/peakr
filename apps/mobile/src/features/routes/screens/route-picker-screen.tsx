import {
  findWorkout,
  formatDuration,
  rankRoutes,
  type LatLon,
  type MatchableRoute,
  type RouteMatch,
  type RouteSport,
  type Workout,
} from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { isEnabled } from '@/config/feature-flags';
import type { StoredRoute } from '@/data/repositories/route-repository';
import { usePlan, usePlanActions } from '@/features/plan/queries';
import { Button, Icon, ListState, radius, Screen, spacing, Text, useTheme } from '@/ui';

import {
  generatedRoute,
  generatedSourceKey,
  useGeneratedRoutes,
  useSaveGeneratedRoute,
  type GeneratedOptions,
} from '../generated';
import { gainPerKm } from '../import';
import { currentLocation } from '../location';
import { useHomeStart, useRoutes } from '../queries';
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
 * user's own routes, the best recognised routes, generated round trips from the start point and
 * the free session (time + HR only).
 */
export function RoutePickerScreen({ workoutId }: { workoutId: string }) {
  const { t } = useTranslation();
  const { data: stored } = usePlan();
  const { data: routes, isPending } = useRoutes();
  const { data: home, isPending: homePending } = useHomeStart();
  const actions = usePlanActions();
  const w = stored ? findWorkout(stored.state.plan, workoutId) : undefined;
  // Without a home start point the user can generate round trips from where they are now.
  const [here, setHere] = useState<LatLon | null>(null);
  const generating = isEnabled('generatedRoutes');
  const generated = useGeneratedRoutes(
    w,
    stored?.input.profile,
    home ?? here,
    generating && !homePending,
  );

  if (isPending || homePending || !stored) {
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
  // Without a start point, distance from the start is ignored.
  const start = home ?? here;
  const rank = (list: StoredRoute[]) =>
    rankRoutes(list.map(matchable), w, stored.input.profile, start, OPTIONS);
  const own = rank(all.filter((r) => r.source !== 'strava'));
  const recognised = rank(all.filter((r) => r.source === 'strava'));

  return (
    <Screen>
      <Text tone="secondary">{t('routes.choose.intro')}</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/training/terrain')}
        testID="choose-start"
      >
        <Text variant="caption" tone="secondary">
          {start ? t('routes.choose.fromHome') : t('routes.choose.noStart')}
        </Text>
      </Pressable>
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
      {generating && (w.sport === 'run' || w.sport === 'bike') ? (
        <GeneratedGroup
          w={w}
          sport={w.sport}
          generated={generated}
          library={all}
          hasStart={start !== null}
          onLocated={setHere}
          onChoose={choose}
        />
      ) : null}
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

function GeneratedGroup({
  w,
  sport,
  generated,
  library,
  hasStart,
  onLocated,
  onChoose,
}: {
  w: Workout;
  sport: RouteSport;
  generated: GeneratedOptions;
  library: StoredRoute[];
  hasStart: boolean;
  onLocated: (start: LatLon) => void;
  onChoose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveGeneratedRoute();
  const [locating, setLocating] = useState<'idle' | 'busy' | 'denied' | 'unavailable'>('idle');
  const { request, picks } = generated;

  const locate = async () => {
    setLocating('busy');
    const result = await currentLocation();
    if (result.ok) {
      setLocating('idle');
      onLocated(result.value);
    } else setLocating(result.error);
  };

  const savedId = (key: string) => library.find((r) => r.sourceKeys.includes(key))?.id;

  let body: ReactNode;
  if (!hasStart || !request) {
    body = (
      <>
        <Text variant="caption" tone="secondary">
          {locating === 'denied' || locating === 'unavailable'
            ? t(`routes.start.location.${locating}`)
            : t('routes.generated.needStart')}
        </Text>
        <Button
          variant="secondary"
          small
          icon="location"
          label={t('routes.generated.useLocation')}
          disabled={locating === 'busy'}
          onPress={() => void locate()}
          testID="generated-locate"
        />
      </>
    );
  } else if (generated.isFetching) {
    body = (
      <Text variant="caption" tone="secondary" testID="generated-loading">
        {t('routes.generated.loading')}
      </Text>
    );
  } else if (generated.error) {
    body = (
      <>
        <Text variant="caption" tone="secondary">
          {t(`routes.generated.error.${generated.error}`)}
        </Text>
        {generated.error === 'subscription' ? null : (
          <Button
            variant="secondary"
            small
            label={t('common.retry')}
            onPress={generated.retry}
            testID="generated-retry"
          />
        )}
      </>
    );
  } else if (picks.length === 0) {
    body = (
      <Text variant="caption" tone="secondary">
        {t('routes.generated.none')}
      </Text>
    );
  } else {
    body = picks.map((pick, i) => {
      const key = generatedSourceKey(request, pick.candidate.id);
      const draft = generatedRoute(
        pick,
        sport,
        t('routes.generated.name', {
          n: i + 1,
          km: Math.round(pick.route.distanceM / 100) / 10,
        }),
        key,
      );
      const existing = savedId(key);
      const chosen = existing !== undefined && w.routeId === existing;
      const use = async () => onChoose(existing ?? (await save.mutateAsync(draft)));
      return (
        <View key={pick.candidate.id} style={styles.gap}>
          <RouteRow
            route={{ ...draft, id: pick.candidate.id, createdAt: 0, updatedAt: 0 }}
            detail={`${chosen ? `${t('routes.choose.selected')} · ` : ''}${matchText(t, pick.match)}`}
            onPress={() => void use()}
            testID={`generated-${pick.candidate.id}`}
          />
          <Button
            variant="secondary"
            small
            icon="route"
            label={existing ? t('routes.generated.saved') : t('routes.generated.save')}
            disabled={existing !== undefined || save.isPending}
            onPress={() => save.mutate(draft)}
            testID={`generated-save-${pick.candidate.id}`}
          />
        </View>
      );
    });
  }

  return (
    <View style={styles.gap}>
      <Text variant="label" accessibilityRole="header">
        {t('routes.generated.title')}
      </Text>
      {body}
      {generated.elevation ? (
        <Text variant="micro" tone="secondary">
          {t('routes.generated.attribution', {
            heights: t(`routes.generated.heights.${generated.elevation}`),
          })}
        </Text>
      ) : null}
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
