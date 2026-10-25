import { classifyTerrain, type RouteSport, type Terrain } from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StoredRoute } from '@/data/repositories/route-repository';
import {
  Button,
  ChipGroup,
  ListState,
  radius,
  Screen,
  spacing,
  Text,
  useTheme,
  type ThemeColors,
} from '@/ui';

import { RouteShape } from '../components/route-shape';
import { gainPerKm } from '../import';
import { useRoutes } from '../queries';

type SportFilter = 'all' | RouteSport;
type SourceFilter = 'all' | 'own' | 'planned' | 'recognised' | 'generated';

/** Which library source each filter shows. */
const SOURCES: Record<Exclude<SourceFilter, 'all'>, readonly StoredRoute['source'][]> = {
  own: ['gpx', 'komoot'],
  planned: ['strava_route'],
  recognised: ['strava'],
  generated: ['generated'],
};
type DistanceFilter = 'all' | 'short' | 'medium' | 'long';
type HillFilter = 'all' | Terrain;

/** Distance bands per sport (km): short < a ≤ medium < b ≤ long. */
const BANDS: Record<RouteSport, [number, number]> = { run: [8, 15], bike: [40, 80] };

export function routeColor(colors: ThemeColors, sport: RouteSport): string {
  return sport === 'bike' ? colors.sportBike : colors.sportRun;
}

export function routeFacts(t: TFunction, r: Pick<StoredRoute, 'distanceM' | 'gainM'>): string {
  return [
    t('plan.km', { value: Math.round(r.distanceM / 100) / 10 }),
    t('routes.gain', { value: r.gainM }),
  ].join(' · ');
}

function distanceBand(r: StoredRoute): Exclude<DistanceFilter, 'all'> {
  const km = r.distanceM / 1000;
  const [a, b] = BANDS[r.sport];
  return km < a ? 'short' : km <= b ? 'medium' : 'long';
}

/**
 * Route library (CLAUDE.md "Route sources"): imported GPX files and routes recognised from past
 * Strava activities, with filters for sport, source, distance and hilliness.
 */
export function RouteLibraryScreen() {
  const { t } = useTranslation();
  const { data: routes, isPending, isError, refetch } = useRoutes();
  const [sport, setSport] = useState<SportFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [distance, setDistance] = useState<DistanceFilter>('all');
  const [hills, setHills] = useState<HillFilter>('all');

  const visible = (routes ?? []).filter(
    (r) =>
      (sport === 'all' || r.sport === sport) &&
      (source === 'all' || SOURCES[source].includes(r.source)) &&
      (distance === 'all' || distanceBand(r) === distance) &&
      (hills === 'all' || classifyTerrain(r.sport, gainPerKm(r)) === hills),
  );

  let list: React.ReactNode;
  if (isPending) list = <ListState kind="loading" label={t('common.loading')} />;
  else if (isError) {
    list = (
      <ListState
        kind="error"
        title={t('common.loadError')}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  } else if ((routes ?? []).length === 0) {
    list = (
      <ListState
        kind="empty"
        icon="route"
        title={t('routes.empty')}
        message={t('routes.emptyHint')}
      />
    );
  } else if (visible.length === 0) {
    list = <ListState kind="empty" icon="route" title={t('routes.noMatch')} />;
  } else {
    list = (
      <View style={styles.list} testID="route-list">
        {visible.map((r) => (
          <RouteRow key={r.id} route={r} />
        ))}
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.actions}>
        <Button
          label={t('routes.importGpx')}
          icon="plus"
          onPress={() => router.push('/routes/import')}
        />
        <Button
          variant="secondary"
          label={t('routes.recognise.open')}
          icon="connections"
          onPress={() => router.push('/routes/recognise')}
        />
      </View>
      {(routes ?? []).length > 0 ? (
        <>
          <ChipGroup
            label={t('routes.filter.sport')}
            options={[
              { value: 'all', label: t('routes.filter.all') },
              { value: 'run', label: t('routes.sport.run') },
              { value: 'bike', label: t('routes.sport.bike') },
            ]}
            selected={[sport]}
            onToggle={setSport}
          />
          <ChipGroup
            label={t('routes.filter.source')}
            options={[
              { value: 'all', label: t('routes.filter.all') },
              { value: 'own', label: t('routes.filter.own') },
              { value: 'planned', label: t('routes.filter.planned') },
              { value: 'recognised', label: t('routes.filter.recognised') },
              { value: 'generated', label: t('routes.filter.generated') },
            ]}
            selected={[source]}
            onToggle={setSource}
          />
          <ChipGroup
            label={t('routes.filter.distance')}
            options={[
              { value: 'all', label: t('routes.filter.all') },
              { value: 'short', label: t('routes.filter.short') },
              { value: 'medium', label: t('routes.filter.medium') },
              { value: 'long', label: t('routes.filter.long') },
            ]}
            selected={[distance]}
            onToggle={setDistance}
          />
          <ChipGroup
            label={t('routes.filter.hills')}
            options={[
              { value: 'all', label: t('routes.filter.all') },
              { value: 'flat', label: t('routes.terrain.flat') },
              { value: 'rolling', label: t('routes.terrain.rolling') },
              { value: 'hilly', label: t('routes.terrain.hilly') },
              { value: 'mountainous', label: t('routes.terrain.mountainous') },
            ]}
            selected={[hills]}
            onToggle={setHills}
          />
        </>
      ) : null}
      {list}
    </Screen>
  );
}

export function RouteRow({
  route,
  onPress,
  detail,
  testID,
}: {
  route: StoredRoute;
  onPress?: () => void;
  /** Extra line, e.g. the expected duration for a session. */
  detail?: string;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const color = routeColor(colors, route.sport);
  const sourceLabel = t(`routes.source.${route.source}`);
  const facts = routeFacts(t, route);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[route.name, t(`routes.sport.${route.sport}`), facts, sourceLabel, detail]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress ?? (() => router.push(`/routes/${encodeURIComponent(route.id)}`))}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surface2 : colors.surface },
      ]}
      testID={testID ?? `route-${route.id}`}
    >
      <RouteShape track={route.polyline} size={48} color={color} />
      <View style={styles.flex}>
        <Text style={styles.strong} numberOfLines={2}>
          {route.name}
        </Text>
        <Text variant="caption" tone="secondary">
          {`${t(`routes.sport.${route.sport}`)} · ${facts}`}
        </Text>
        <Text variant="micro" tone="secondary">
          {detail ?? sourceLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  flex: { flex: 1, gap: 2 },
  strong: { fontWeight: '500' },
});
