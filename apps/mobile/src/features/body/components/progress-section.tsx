import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, ListState, numeric, spacing, StatTile, Text, useTheme } from '@/ui';

import { useWeightTrend } from '../queries';

/**
 * Body → Progress: the smoothed weight trend (never single weigh-ins as "progress") and the coach.
 * The coach's weekly review arrives with the adaptive energy model; until then it explains what
 * it will look at. Wording stays gentle: no praise for fast loss, no shame for gains.
 */
export function ProgressSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const trend = useWeightTrend();
  if (!trend) return <ListState kind="loading" label={t('common.loading')} />;
  const last = trend.at(-1);
  const weekAgo = last
    ? [...trend].reverse().find((p) => p.date <= shiftDays(last.date, -7))
    : undefined;
  const change = last && weekAgo ? Math.round((last.trendKg - weekAgo.trendKg) * 10) / 10 : null;

  return (
    <View style={styles.stack} testID="body-progress">
      <Text variant="heading">{t('bodyAddon.progress.title')}</Text>
      {last ? (
        <View style={styles.tiles}>
          <StatTile
            value={t('bodyAddon.progress.kg', { kg: last.trendKg })}
            label={t('bodyAddon.progress.trend')}
          />
          <StatTile
            value={
              change === null
                ? '–'
                : t('bodyAddon.progress.kgSigned', { kg: `${change > 0 ? '+' : ''}${change}` })
            }
            label={t('bodyAddon.progress.week')}
          />
        </View>
      ) : (
        <Text tone="secondary">{t('bodyAddon.progress.empty')}</Text>
      )}
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.progress.trendHint')}
      </Text>

      <Card style={styles.stack} testID="body-coach">
        <View style={styles.row}>
          <Icon name="sparkles" size={20} color={colors.textMuted} />
          <Text variant="heading" style={styles.flex}>
            {t('bodyAddon.coach.title')}
          </Text>
        </View>
        <Text tone="secondary">{t('bodyAddon.coach.body')}</Text>
        {last ? (
          <Text style={numeric}>{t('bodyAddon.coach.weighIns', { count: trend.length })}</Text>
        ) : null}
      </Card>
    </View>
  );
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
