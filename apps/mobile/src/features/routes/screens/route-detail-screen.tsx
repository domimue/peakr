import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Button,
  ListState,
  Screen,
  spacing,
  StatTile,
  TileGrid,
  Text,
  TextField,
  useTheme,
} from '@/ui';

import { ElevationChart } from '../components/elevation-chart';
import { RouteMap } from '../components/route-map';
import {
  useDeleteRoute,
  useHomeStart,
  useRenameRoute,
  useRoute,
  useSaveHomeStart,
} from '../queries';
import { routeColor } from './route-library-screen';

/**
 * One library route: map, elevation profile, figures, climbs; rename, delete, use its start as the
 * home start point.
 */
export function RouteDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: route, isPending } = useRoute(id);
  const rename = useRenameRoute();
  const remove = useDeleteRoute();
  const { data: home } = useHomeStart();
  const saveHome = useSaveHomeStart();
  const [name, setName] = useState<string | null>(null);

  if (isPending) {
    return (
      <Screen>
        <ListState kind="loading" label={t('common.loading')} />
      </Screen>
    );
  }
  if (!route) {
    return (
      <Screen>
        <ListState kind="empty" icon="route" title={t('routes.notFound')} />
      </Screen>
    );
  }

  const color = routeColor(colors, route.sport);
  const draft = name ?? route.name;
  const trimmed = draft.trim();

  function onDelete() {
    if (!route) return;
    Alert.alert(t('routes.deleteTitle'), t('routes.deleteMessage', { name: route.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('routes.delete'),
        style: 'destructive',
        onPress: () => {
          remove.mutate(route.id, { onSuccess: () => router.back() });
        },
      },
    ]);
  }

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {route.name}
      </Text>
      <Text variant="caption" tone="secondary">
        {`${t(`routes.sport.${route.sport}`)} · ${t(`routes.source.${route.source}`)}`}
      </Text>
      <RouteMap polyline={route.polyline} color={color} testID="route-map" />
      {route.source === 'generated' ? (
        <Text variant="micro" tone="secondary">
          {t('routes.generated.attributionShort')}
        </Text>
      ) : null}
      <TileGrid>
        <StatTile
          value={t('plan.km', { value: Math.round(route.distanceM / 100) / 10 })}
          label={t('routes.stats.distance')}
        />
        <StatTile
          value={t('routes.meters', { value: route.gainM })}
          label={t('routes.stats.gain')}
        />
        <StatTile
          value={t('routes.meters', { value: route.lossM })}
          label={t('routes.stats.loss')}
        />
      </TileGrid>
      <ElevationChart
        profile={route.profile}
        color={color}
        gainM={route.gainM}
        lossM={route.lossM}
      />
      {route.climbs.length > 0 ? (
        <View style={styles.gap} testID="route-climbs">
          <Text variant="label" accessibilityRole="header">
            {t('routes.climbs.title')}
          </Text>
          {route.climbs.map((c) => (
            <Text key={c.startM} variant="caption">
              {t('routes.climbs.item', {
                from: (c.startM / 1000).toFixed(1),
                length: c.endM - c.startM,
                avg: (c.avgGradient * 100).toFixed(1),
                max: (c.maxGradient * 100).toFixed(1),
                gain: c.gainM,
              })}
            </Text>
          ))}
        </View>
      ) : null}
      <TextField
        label={t('routes.name')}
        value={draft}
        onChangeText={setName}
        maxLength={200}
        error={trimmed === '' ? t('validation.required') : undefined}
      />
      <Button
        label={t('common.save')}
        disabled={trimmed === '' || trimmed === route.name || rename.isPending}
        onPress={() =>
          rename.mutate({ id: route.id, name: trimmed }, { onSuccess: () => setName(null) })
        }
      />
      {home && home.lat === route.start.lat && home.lon === route.start.lon ? (
        <Text variant="caption" tone="secondary" testID="route-is-home">
          {t('routes.start.isHome')}
        </Text>
      ) : (
        <Button
          variant="secondary"
          label={t('routes.start.useRoute')}
          disabled={saveHome.isPending}
          onPress={() => saveHome.mutate(route.start)}
        />
      )}
      <Button variant="danger" label={t('routes.delete')} onPress={onDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.xs },
});
