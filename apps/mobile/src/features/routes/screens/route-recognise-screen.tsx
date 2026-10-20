import {
  recogniseRoutes,
  type ActivitySource,
  type RecognisedRoute,
  type SourceRef,
} from '@peakr/engine';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import * as routeRepo from '@/data/repositories/route-repository';
import { requestSync } from '@/data/sync/use-background-sync';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { useActivityRecords } from '@/features/activities/queries';
import { fetchStravaStreams, importStravaHistory } from '@/features/integrations/api';
import { Button, ListState, radius, Screen, spacing, Text, useTheme } from '@/ui';

import { RouteShape } from '../components/route-shape';
import { pointsFromActivity, routeFromPoints } from '../import';
import { useRoutes, useSaveRoute } from '../queries';
import { routeColor } from './route-library-screen';

const externalIdOf = (key: string) => key.slice(key.indexOf(':') + 1);
const sourceOf = (key: string) => key.slice(0, key.indexOf(':')) as ActivitySource;

/**
 * Routes recognised from the user's own past Strava activities (CLAUDE.md "Route sources"):
 * tracks that start at the same place and follow the same path are suggested once they were done
 * at least twice. Strava data is used only for this user's own library.
 */
export function RouteRecogniseScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore(selectAccountUserId);
  const { data: records, isPending } = useActivityRecords();
  const { data: library } = useRoutes();
  const save = useSaveRoute();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const known = new Set((library ?? []).flatMap((r) => r.sourceKeys));
    const tracks = (records ?? []).map((a) => ({
      key: `${a.source}:${a.externalId}`,
      sport: a.sport,
      startTime: a.startTime,
      indoor: a.indoor,
      polyline: a.polyline,
    }));
    return recogniseRoutes(tracks, known);
  }, [records, library]);

  async function onSearch() {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await importStravaHistory();
      if (!r.ok) {
        setMessage(
          t(r.reason === 'rate_limited' ? 'connections.rateLimited' : 'routes.recognise.failed'),
        );
        return;
      }
      if (await requestSync(userId)) await queryClient.invalidateQueries();
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(route: RecognisedRoute) {
    setBusy(true);
    setMessage(null);
    try {
      const ref: SourceRef = {
        source: sourceOf(route.representativeKey),
        externalId: externalIdOf(route.representativeKey),
      };
      let [stream] = await routeRepo.getStreams([ref]);
      // Activities imported before Phase 8 have no elevation stream yet: fetch it once.
      if (!stream && ref.source === 'strava' && userId) {
        if (await fetchStravaStreams([ref.externalId])) {
          await requestSync(userId);
          [stream] = await routeRepo.getStreams([ref]);
        }
      }
      const draft = routeFromPoints(
        pointsFromActivity(route.polyline, stream ?? null),
        t('routes.recognise.defaultName', {
          sport: t(`routes.sport.${route.sport}`),
          km: Math.round(route.distanceM / 100) / 10,
        }),
        route.sport,
        'strava',
        route.activityKeys,
      );
      await save.mutateAsync(draft);
      // The suggestion disappears: its activities are in the library now.
      setMessage(t(stream ? 'routes.recognise.addedMessage' : 'routes.recognise.noElevation'));
    } finally {
      setBusy(false);
    }
  }

  let list: React.ReactNode;
  if (isPending) list = <ListState kind="loading" label={t('common.loading')} />;
  else if (suggestions.length === 0) {
    list = (
      <ListState
        kind="empty"
        icon="route"
        title={t('routes.recognise.none')}
        message={t('routes.recognise.noneHint')}
      />
    );
  } else {
    list = (
      <View style={styles.list} testID="recognised-list">
        {suggestions.map((r) => (
          <Suggestion
            key={r.representativeKey}
            route={r}
            disabled={busy}
            onAdd={() => void onAdd(r)}
          />
        ))}
      </View>
    );
  }

  return (
    <Screen>
      <Text tone="secondary">{t('routes.recognise.intro')}</Text>
      <Button
        variant="secondary"
        label={t('routes.recognise.search')}
        icon="connections"
        disabled={busy || !userId}
        onPress={() => void onSearch()}
      />
      {!userId ? (
        <Text variant="caption" tone="secondary">
          {t('routes.recognise.signIn')}
        </Text>
      ) : null}
      {message ? (
        <Text variant="caption" accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      {list}
    </Screen>
  );
}

function Suggestion({
  route,
  disabled,
  onAdd,
}: {
  route: RecognisedRoute;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const facts = [
    t(`routes.sport.${route.sport}`),
    t('plan.km', { value: Math.round(route.distanceM / 100) / 10 }),
    t('routes.recognise.times', { count: route.occurrences }),
  ].join(' · ');
  return (
    <View
      style={[styles.row, { backgroundColor: colors.surface }]}
      testID={`suggestion-${route.representativeKey}`}
    >
      <RouteShape track={route.polyline} size={48} color={routeColor(colors, route.sport)} />
      <View style={styles.flex}>
        <Text variant="caption">{facts}</Text>
        <Text variant="micro" tone="secondary">
          {t('routes.recognise.last', { date: route.lastDate })}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('routes.recognise.add')}, ${facts}`}
        disabled={disabled}
        onPress={onAdd}
        style={[styles.add, { borderColor: colors.border }]}
      >
        <Text variant="caption">{t('routes.recognise.add')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  flex: { flex: 1, gap: 2 },
  add: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 44,
    justifyContent: 'center',
  },
});
