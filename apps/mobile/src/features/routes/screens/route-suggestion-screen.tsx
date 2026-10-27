import { formatDuration } from '@peakr/engine';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { RouteDraft } from '@/data/routes/build';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { useUnits } from '@/features/settings/units';
import { Button, ListState, Screen, spacing, StatTile, Text, TextField, useTheme } from '@/ui';

import { ElevationChart } from '../components/elevation-chart';
import { RouteMap } from '../components/route-map';
import { useHomeStart, useSaveRoute } from '../queries';
import { suggestRouteName } from '../route-name';
import { suggestionDraft, useRouteSuggestions } from '../suggestions';
import { routeColor } from './route-library-screen';

/**
 * A route recognised from past activities, before it is added (CLAUDE.md "Route sources"): map,
 * elevation profile, distance, climb, how often and when it was done, the typical duration and a
 * name suggested from the start point – editable. Nothing is added blind.
 */
export function RouteSuggestionScreen({ routeKey }: { routeKey: string }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { distance } = useUnits();
  const userId = useSessionStore(selectAccountUserId);
  const { suggestions, isPending } = useRouteSuggestions();
  const { data: home } = useHomeStart();
  const save = useSaveRoute();
  const route = suggestions.find((r) => r.representativeKey === routeKey);
  const [draft, setDraft] = useState<{ draft: RouteDraft; hasElevation: boolean } | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!route || draft) return;
    let alive = true;
    void (async () => {
      const suggested = await suggestRouteName(t, route, home ?? null);
      const built = await suggestionDraft(route, suggested, userId);
      if (!alive) return;
      setDraft(built);
      setName((current) => current ?? suggested);
    })();
    return () => {
      alive = false;
    };
  }, [route, draft, home, t, userId]);

  if (isPending) return <ListState kind="loading" label={t('common.loading')} />;
  if (!route) {
    return (
      <Screen>
        <ListState kind="empty" icon="route" title={t('routes.recognise.gone')} />
      </Screen>
    );
  }
  const color = routeColor(colors, route.sport);
  const gain = draft?.hasElevation ? draft.draft.gainM : route.elevationGainM;
  const trimmed = (name ?? '').trim();
  const last = new Date(`${route.lastDate}T12:00:00`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Screen>
      <RouteMap polyline={route.polyline} color={color} testID="suggestion-map" />
      {draft?.hasElevation && draft.draft.profile.length > 1 ? (
        <ElevationChart
          profile={draft.draft.profile}
          color={color}
          gainM={draft.draft.gainM}
          lossM={draft.draft.lossM}
        />
      ) : (
        <Text variant="caption" tone="secondary">
          {draft ? t('routes.recognise.noElevation') : t('common.loading')}
        </Text>
      )}
      <View style={styles.tiles}>
        <StatTile value={distance(route.distanceM / 1000)} label={t('routes.stats.distance')} />
        <StatTile
          value={gain === null ? '–' : t('routes.stats.gainValue', { m: Math.round(gain) })}
          label={t('routes.stats.gain')}
        />
        <StatTile
          value={t('routes.recognise.times', { count: route.occurrences })}
          label={t('routes.stats.done')}
        />
        <StatTile value={last} label={t('routes.stats.last')} />
        <StatTile
          value={route.typicalDurationSec === null ? '–' : formatDuration(route.typicalDurationSec)}
          label={t('routes.stats.typical')}
        />
      </View>
      <TextField
        label={t('routes.name')}
        value={name ?? ''}
        onChangeText={setName}
        testID="suggestion-name"
      />
      <Button
        label={t('routes.recognise.add')}
        disabled={!draft || trimmed === '' || save.isPending}
        onPress={() =>
          draft &&
          save.mutate({ ...draft.draft, name: trimmed }, { onSuccess: () => router.back() })
        }
        testID="suggestion-add"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
