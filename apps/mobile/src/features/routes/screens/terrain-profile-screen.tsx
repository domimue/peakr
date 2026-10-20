import { learnTerrainProfile, profileFromStreams, type TerrainSample } from '@peakr/engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { useActivityRecords } from '@/features/activities/queries';
import { usePlan, usePlanActions } from '@/features/plan/queries';
import { Button, Card, ListState, Screen, spacing, StatTile, Text } from '@/ui';

import { useStreams } from '../queries';

/**
 * Terrain profile (CLAUDE.md "Terrain intelligence" §1): the home terrain from the quiz next to
 * what the user's recent outdoor runs and rides show – gain per km and typical climbs. The user
 * can adopt the learned terrain; the remaining plan is then generated again.
 */
export function TerrainProfileScreen() {
  const { t } = useTranslation();
  const { data: stored } = usePlan();
  const actions = usePlanActions();
  const { data: records, isPending } = useActivityRecords();
  const { data: streams } = useStreams();
  const [notice, setNotice] = useState<string | null>(null);

  const learned = useMemo(() => {
    const byKey = new Map((streams ?? []).map((s) => [`${s.source}:${s.externalId}`, s]));
    const samples: TerrainSample[] = (records ?? []).map((a) => {
      const s = byKey.get(`${a.source}:${a.externalId}`);
      return {
        sport: a.sport,
        date: a.date,
        indoor: a.indoor,
        distanceM: a.distanceM,
        elevationGainM: a.elevationGainM,
        profile: s ? profileFromStreams(s.data.distanceM, s.data.altitudeM) : null,
      };
    });
    return learnTerrainProfile(samples, todayIso());
  }, [records, streams]);

  if (isPending) {
    return (
      <Screen>
        <ListState kind="loading" label={t('common.loading')} />
      </Screen>
    );
  }

  const current = stored?.input.profile.terrain ?? null;

  function adopt() {
    if (!stored || !learned) return;
    const result = actions.updateProfile({ ...stored.input.profile, terrain: learned.terrain });
    setNotice(result.ok ? t('terrainProfile.adopted') : t('terrainProfile.adoptFailed'));
  }

  return (
    <Screen>
      <Text tone="secondary">{t('terrainProfile.intro')}</Text>
      {current ? (
        <Text testID="terrain-quiz">
          {t('terrainProfile.quiz', { terrain: t(`routes.terrain.${current}`) })}
        </Text>
      ) : null}
      {!learned ? (
        <ListState
          kind="empty"
          icon="hills"
          title={t('terrainProfile.empty')}
          message={t('terrainProfile.emptyHint')}
          actionLabel={t('terrainProfile.connect')}
          onAction={() => router.push('/integrations')}
        />
      ) : (
        <View style={styles.gap} testID="terrain-learned">
          <Text variant="label" accessibilityRole="header">
            {t('terrainProfile.learned', { terrain: t(`routes.terrain.${learned.terrain}`) })}
          </Text>
          <Text variant="caption" tone="secondary">
            {t('terrainProfile.basis', { count: learned.activities })}
          </Text>
          <View style={styles.tiles}>
            {learned.sports.map((s) => (
              <StatTile
                key={s.sport}
                value={t('terrainProfile.gainPerKm', { value: s.gainPerKm })}
                label={`${t(`routes.sport.${s.sport}`)} · ${t(`routes.terrain.${s.terrain}`)}`}
              />
            ))}
          </View>
          {learned.climbs.length > 0 ? (
            <Card>
              <Text variant="label" accessibilityRole="header">
                {t('terrainProfile.climbs')}
              </Text>
              {learned.climbs.map((c, i) => (
                <Text key={i} variant="caption">
                  {t('terrainProfile.climb', {
                    length: c.endM - c.startM,
                    avg: (c.avgGradient * 100).toFixed(1),
                    gain: c.gainM,
                  })}
                </Text>
              ))}
            </Card>
          ) : null}
          {stored && learned.terrain !== current ? (
            <Button
              label={t('terrainProfile.adopt', { terrain: t(`routes.terrain.${learned.terrain}`) })}
              onPress={adopt}
            />
          ) : null}
          {notice ? (
            <Text variant="caption" accessibilityRole="alert">
              {notice}
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.sm },
});
