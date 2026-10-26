import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, ListState, numeric, spacing, StatTile, Text, useTheme } from '@/ui';

import { useBodyModel } from '../model';

const signed = (n: number, decimals = 1) => {
  const f = 10 ** decimals;
  const v = Math.round(n * f) / f;
  return `${v > 0 ? '+' : ''}${v}`;
};

/**
 * Body → Progress: trend, this and last week's energy balance with the fat estimate, the
 * adaptive maintenance estimate with what it is based on, "calculation vs. scale", fat and lean
 * mass, and the coach. Every number here is an estimate and says so; the wording never praises a
 * fast loss and never shames a gain.
 */
export function ProgressSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const model = useBodyModel();
  if (!model) return <ListState kind="loading" label={t('common.loading')} />;
  const { trend, adaptive, scale, composition } = model;
  const last = trend.at(-1);
  const weekAgo = last
    ? [...trend].reverse().find((p) => p.date <= shiftDays(last.date, -7))
    : undefined;
  const change = last && weekAgo ? last.trendKg - weekAgo.trendKg : null;

  return (
    <View style={styles.stack} testID="body-progress">
      <Text variant="heading">{t('bodyAddon.progress.title')}</Text>
      {model.tooFastLoss ? (
        <Card testID="body-too-fast">
          <Text>{t('bodyAddon.progress.tooFast')}</Text>
        </Card>
      ) : null}
      {last ? (
        <View style={styles.tiles}>
          <StatTile
            value={t('bodyAddon.progress.kg', { kg: last.trendKg })}
            label={t('bodyAddon.progress.trend')}
          />
          <StatTile
            value={change === null ? '–' : t('bodyAddon.progress.kgSigned', { kg: signed(change) })}
            label={t('bodyAddon.progress.week')}
          />
        </View>
      ) : (
        <Text tone="secondary">{t('bodyAddon.progress.empty')}</Text>
      )}
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.progress.trendHint')}
      </Text>

      <Card style={styles.stack} testID="body-balance">
        <Text variant="label">{t('bodyAddon.balance.title')}</Text>
        {(
          [
            ['thisWeek', model.thisWeek],
            ['lastWeek', model.lastWeek],
          ] as const
        ).map(([key, w]) => (
          <View key={key} style={styles.row}>
            <Text tone="secondary" style={styles.flex}>
              {t(`bodyAddon.balance.${key}`)}
            </Text>
            <Text style={numeric}>
              {w.completeDays === 0
                ? t('bodyAddon.balance.noDays')
                : t('bodyAddon.balance.line', {
                    kcal: signed(w.balanceKcal, 0),
                    kg: signed(w.fatKg, 2),
                    days: w.completeDays,
                  })}
            </Text>
          </View>
        ))}
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.balance.hint')}
        </Text>
      </Card>

      <Card style={styles.stack} testID="body-tdee">
        <Text variant="label">{t('bodyAddon.tdee.title')}</Text>
        {adaptive.status === 'ok' ? (
          <>
            <Text variant="title" style={numeric}>
              {t('bodyAddon.kcal', { kcal: adaptive.estimate.tdeeKcal })}
            </Text>
            <Text tone="secondary">
              {t('bodyAddon.tdee.basis', {
                days: adaptive.estimate.basis.intakeDays,
                formula: adaptive.estimate.formulaKcal,
              })}
            </Text>
          </>
        ) : (
          <Text tone="secondary">
            {t('bodyAddon.tdee.notYet', { days: adaptive.usedDays, needed: adaptive.neededDays })}
          </Text>
        )}
      </Card>

      <Card style={styles.stack} testID="body-scale">
        <Text variant="label">{t('bodyAddon.scale.title')}</Text>
        {scale.status === 'ok' ? (
          <>
            <Text style={numeric}>
              {t('bodyAddon.scale.line', {
                expected: signed(scale.expectedKg),
                actual: signed(scale.actualKg),
                weeks: scale.weeks.length,
              })}
            </Text>
            <Text tone="secondary" style={numeric}>
              {t('bodyAddon.scale.deviation', { kg: signed(scale.deviationKg) })}
            </Text>
            <Text variant="caption" tone="secondary">
              {t(`bodyAddon.scale.confidence.${scale.confidence}`)}
            </Text>
          </>
        ) : (
          <Text tone="secondary">{t('bodyAddon.scale.notEnough')}</Text>
        )}
      </Card>

      <Card style={styles.stack} testID="body-composition">
        <Text variant="label">{t('bodyAddon.composition.title')}</Text>
        {composition.status === 'ok' ? (
          <>
            <Text style={numeric}>
              {t('bodyAddon.composition.current', {
                fat: composition.current.fatKg,
                lean: composition.current.leanKg,
              })}
            </Text>
            {composition.change ? (
              <Text tone="secondary" style={numeric}>
                {t('bodyAddon.composition.change', {
                  fat: signed(composition.change.fatKg),
                  lean: signed(composition.change.leanKg),
                })}
              </Text>
            ) : null}
            <Text variant="caption" tone="secondary">
              {t('bodyAddon.composition.estimate')}
            </Text>
          </>
        ) : (
          <Text tone="secondary">{t('bodyAddon.composition.notEnough')}</Text>
        )}
      </Card>

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
