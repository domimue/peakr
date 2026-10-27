import type { RecognisedRoute } from '@peakr/engine';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { requestSync } from '@/data/sync/use-background-sync';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { importStravaHistory } from '@/features/integrations/api';
import { Button, Icon, ListState, radius, Screen, spacing, Text, useTheme } from '@/ui';

import { RouteShape } from '../components/route-shape';
import { useRouteSuggestions } from '../suggestions';
import { routeColor } from './route-library-screen';

/**
 * Routes recognised from the user's own past Strava activities (CLAUDE.md "Route sources"):
 * tracks that start at the same place and follow the same path are suggested once they were done
 * at least twice. Strava data is used only for this user's own library.
 */
export function RouteRecogniseScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useSessionStore(selectAccountUserId);
  const { suggestions, isPending } = useRouteSuggestions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
            onOpen={() =>
              router.push(`/routes/suggestion/${encodeURIComponent(r.representativeKey)}`)
            }
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

/** One suggestion; the whole row opens its preview (map, profile, figures, name, "Add"). */
function Suggestion({ route, onOpen }: { route: RecognisedRoute; onOpen: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const facts = [
    t(`routes.sport.${route.sport}`),
    t('plan.km', { value: Math.round(route.distanceM / 100) / 10 }),
    t('routes.recognise.times', { count: route.occurrences }),
  ].join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${facts}, ${t('routes.recognise.last', { date: route.lastDate })}`}
      accessibilityHint={t('routes.recognise.openHint')}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surface2 : colors.surface },
      ]}
      testID={`suggestion-${route.representativeKey}`}
    >
      <RouteShape track={route.polyline} size={48} color={routeColor(colors, route.sport)} />
      <View style={styles.flex}>
        <Text variant="caption">{facts}</Text>
        <Text variant="micro" tone="secondary">
          {t('routes.recognise.last', { date: route.lastDate })}
        </Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.textMuted} />
    </Pressable>
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
});
