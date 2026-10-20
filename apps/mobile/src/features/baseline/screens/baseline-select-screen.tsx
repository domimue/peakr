import { formatDuration } from '@peakr/engine';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StoredBaselineActivity } from '@/data/repositories/baseline-repository';
import { Button, CheckBox, CheckRow, radius, Screen, spacing, Text, useTheme } from '@/ui';

import { useBaselineStore } from '../baseline-store';
import { activitySpeedText, distanceText } from '../format';
import { baselineRoutes, type BaselineFlow } from './baseline-step';

/**
 * The activities of the last 60 days: everything ticked except obvious outliers (with the reason),
 * and the user decides. Reference data only – the list says so.
 */
export function BaselineSelectScreen({ flow }: { flow: BaselineFlow }) {
  const { t } = useTranslation();
  const { activities, hydrated, hydrate, toggle, selectAll } = useBaselineStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) return <Screen />;
  const allSelected = activities.length > 0 && activities.every((a) => a.selected);
  const count = activities.filter((a) => a.selected).length;

  return (
    <Screen title={flow === 'onboarding' ? t('baseline.select.title') : undefined}>
      <Text tone="secondary">{t('baseline.select.intro')}</Text>
      <Text variant="caption" tone="secondary">
        {t('baseline.referenceOnly')}
      </Text>
      {activities.length === 0 ? (
        <Text>{t('baseline.select.empty')}</Text>
      ) : (
        <>
          <CheckRow
            label={t('baseline.select.all', { count: activities.length })}
            checked={allSelected}
            onChange={selectAll}
          />
          <View style={styles.list}>
            {activities.map((a) => (
              <ActivityRow key={a.externalId} activity={a} onToggle={() => toggle(a.externalId)} />
            ))}
          </View>
        </>
      )}
      <Button
        label={t('baseline.select.continue', { count })}
        onPress={() => router.replace(baselineRoutes(flow).summary)}
      />
    </Screen>
  );
}

function ActivityRow({
  activity: a,
  onToggle,
}: {
  activity: StoredBaselineActivity;
  onToggle: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const sport = t(`activities.sport.${a.sport}`);
  const date = new Date(`${a.date}T12:00:00Z`).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const facts = [
    date,
    sport,
    a.distanceM ? distanceText(t, a.sport, a.distanceM) : null,
    formatDuration(a.durationSec),
    a.avgHr ? t('baseline.select.avgHr', { value: Math.round(a.avgHr) }) : null,
    activitySpeedText(t, a),
    a.indoor ? t('baseline.select.indoor') : null,
    a.manual ? t('baseline.select.manual') : null,
  ].filter((x): x is string => x !== null);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: a.selected }}
      accessibilityLabel={`${a.name ?? sport}, ${facts.join(', ')}`}
      onPress={onToggle}
      style={[
        styles.row,
        {
          borderColor: a.selected ? colors.accentLine : colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <CheckBox checked={a.selected} />
      <View style={styles.text}>
        <Text style={styles.name}>{a.name ?? sport}</Text>
        <Text variant="caption" tone="secondary">
          {facts.join(' · ')}
        </Text>
        {a.outlier ? (
          <Text variant="caption" tone="secondary">
            {t(`baseline.outlier.${a.outlier}`)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  text: { flex: 1, gap: 2 },
  name: { fontWeight: '600' },
});
