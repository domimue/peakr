import { changeTone } from '@peakr/engine';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, ListState, numeric, spacing, StatTile, Text, TileGrid, useTheme } from '@/ui';

import { useBodyDashboard } from '../dashboard';
import { EnergyBarsChart } from './charts/energy-bars-chart';
import { TrendChart } from './charts/trend-chart';

const signed = (n: number, decimals = 1) => {
  const f = 10 ** decimals;
  const v = Math.round(n * f) / f;
  return `${v > 0 ? '+' : ''}${v}`;
};

const short = (iso: string, language: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(language, { day: 'numeric', month: 'short' });

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The direction is in the text, never in the colour alone. */
const arrow = (n: number) => (round1(n) > 0 ? '▲' : round1(n) < 0 ? '▼' : '●');

const TONE = {
  favourable: 'changeFavourable',
  unfavourable: 'changeUnfavourable',
  neutral: 'changeNeutral',
} as const;

const kgOrDash = (t: TFunction, kg: number | null, withSign = false) =>
  kg === null ? '–' : t('bodyAddon.progress.kg', { kg: withSign ? signed(kg) : kg });

/**
 * Body → weight & body: KPI tiles with their change (in the change colours, the direction always
 * in the text too), the trend chart with goal and forecast, weekly energy and fat balance, the
 * adaptive maintenance, "calculation vs. scale", fat vs. lean mass, body indices, the
 * measurements as a table and this week's training from Teil A.
 * Every figure here is an estimate and says so; the wording never praises a fast loss and never
 * shames a gain.
 */
export function ProgressSection() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const dash = useBodyDashboard();
  if (!dash) return <ListState kind="loading" label={t('common.loading')} />;
  const { model, kpis, chart, bars, indices, measurements, training } = dash;
  const goalKind = model.goal && !model.goal.paused ? model.goal.kind : null;
  const first = model.trend[0]?.date;
  const waist =
    measurements.find((m) => m.key === 'waist') ?? measurements.find((m) => m.key === 'belly');
  const { adaptive, scale, composition } = model;
  const recentBars = bars.slice(-4).reverse();

  return (
    <View style={styles.stack} testID="body-progress">
      <Text variant="heading">{t('bodyAddon.progress.title')}</Text>

      <TileGrid testID="body-kpis">
        <StatTile
          testID="kpi-trend"
          value={kgOrDash(t, kpis.trendKg)}
          label={t('bodyAddon.progress.trend')}
          context={
            kpis.lastWeekKg === null
              ? undefined
              : t('bodyAddon.dashboard.kpi.weekChange', {
                  arrow: arrow(kpis.lastWeekKg),
                  kg: Math.abs(round1(kpis.lastWeekKg)),
                })
          }
          tone={changeTone('weight', goalKind, kpis.lastWeekKg)}
        />
        <StatTile
          testID="kpi-start"
          value={kgOrDash(t, kpis.sinceStartKg, true)}
          label={t('bodyAddon.dashboard.kpi.sinceStart')}
          context={
            first
              ? t('bodyAddon.dashboard.kpi.sinceDate', { date: short(first, i18n.language) })
              : undefined
          }
          tone={changeTone('weight', goalKind, kpis.sinceStartKg)}
        />
        <StatTile
          testID="kpi-fat"
          value={
            kpis.bodyFatPct === null ? '–' : t('bodyAddon.dashboard.pct', { pct: kpis.bodyFatPct })
          }
          label={t('bodyAddon.dashboard.kpi.bodyFat')}
        />
        <StatTile
          testID="kpi-waist"
          value={kpis.waistCm === null ? '–' : t('bodyAddon.dashboard.cm', { cm: kpis.waistCm })}
          label={t('bodyAddon.dashboard.kpi.waist')}
          context={
            waist?.changeCm == null
              ? undefined
              : t('bodyAddon.dashboard.kpi.cmChange', {
                  arrow: arrow(waist.changeCm),
                  cm: Math.abs(round1(waist.changeCm)),
                  date: short(waist.startDay, i18n.language),
                })
          }
          tone={waist ? changeTone(waist.key, goalKind, waist.changeCm) : undefined}
        />
      </TileGrid>

      {model.tooFastLoss ? (
        <Card testID="body-too-fast">
          <Text>{t('bodyAddon.progress.tooFast')}</Text>
        </Card>
      ) : null}

      <Card style={styles.stack} testID="body-trend">
        <Text variant="label">{t('bodyAddon.dashboard.chart.title')}</Text>
        {chart.trend.length > 0 ? (
          <TrendChart
            trend={chart.trend}
            targetKg={chart.targetKg}
            planned={chart.planned}
            real={chart.real}
            accessibilityLabel={t('bodyAddon.dashboard.chart.a11y', {
              kg: kpis.trendKg,
              change: kpis.sinceStartKg === null ? '–' : signed(kpis.sinceStartKg),
            })}
          />
        ) : (
          <Text tone="secondary">{t('bodyAddon.progress.empty')}</Text>
        )}
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.progress.trendHint')}
        </Text>
      </Card>

      <Card style={styles.stack} testID="body-balance">
        <Text variant="label">{t('bodyAddon.balance.title')}</Text>
        <EnergyBarsChart
          bars={bars}
          labels={bars.map((b) => short(b.week, i18n.language))}
          accessibilityLabel={t('bodyAddon.dashboard.energy.a11y')}
        />
        {recentBars.map((b) => (
          <View key={b.week} style={styles.row} testID={`balance-${b.week}`}>
            <Text tone="secondary" style={styles.flex}>
              {t('bodyAddon.dashboard.energy.weekOf', { date: short(b.week, i18n.language) })}
            </Text>
            <Text style={numeric}>
              {b.balanceKcal === null || b.fatKg === null
                ? t('bodyAddon.balance.noDays')
                : t(
                    b.balanceKcal <= 0
                      ? 'bodyAddon.dashboard.energy.deficit'
                      : 'bodyAddon.dashboard.energy.surplus',
                    {
                      kcal: Math.abs(b.balanceKcal),
                      kg: signed(b.fatKg, 2),
                      days: b.loggedDays,
                    },
                  )}
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
            <View style={styles.tight} testID="scale-reasons">
              {dash.scaleReasons.map((r) => (
                <Text key={r} tone="secondary">
                  {`• ${t(`bodyAddon.scale.reason.${r}`)}`}
                </Text>
              ))}
            </View>
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

      {indices ? (
        <Card style={styles.stack} testID="body-indices">
          <Text variant="label">{t('bodyAddon.dashboard.indices.title')}</Text>
          {(
            [
              ['bmi', indices.bmi],
              ['waistToHeight', indices.waistToHeight],
              ['waistToHip', indices.waistToHip],
            ] as const
          ).map(([key, value]) => (
            <View key={key} style={styles.row}>
              <Text tone="secondary" style={styles.flex}>
                {t(`bodyAddon.dashboard.indices.${key}`)}
              </Text>
              <Text style={numeric}>{value === null ? '–' : String(value)}</Text>
            </View>
          ))}
          <Text variant="caption" tone="secondary">
            {t('bodyAddon.dashboard.indices.hint')}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.stack} testID="body-measurements">
        <Text variant="label" accessibilityRole="header">
          {t('bodyAddon.dashboard.measurements.title')}
        </Text>
        {measurements.length === 0 ? (
          <Text tone="secondary">{t('bodyAddon.dashboard.measurements.empty')}</Text>
        ) : (
          <View testID="measurements-table">
            <View style={[styles.tableRow, { borderBottomColor: colors.border }]}>
              <Text variant="micro" tone="secondary" style={[styles.caps, styles.flex]}>
                {t('bodyAddon.dashboard.measurements.name')}
              </Text>
              <Text variant="micro" tone="secondary" style={[styles.caps, styles.cell]}>
                {t('bodyAddon.dashboard.measurements.now')}
              </Text>
              <Text variant="micro" tone="secondary" style={[styles.caps, styles.cell]}>
                {t('bodyAddon.dashboard.measurements.changeCol')}
              </Text>
            </View>
            {measurements.map((m) => {
              const label = t(`bodyAddon.checkIn.fields.${m.key}.label`);
              const now = t('bodyAddon.dashboard.cm', { cm: m.currentCm });
              const change =
                m.changeCm === null ? '–' : t('bodyAddon.dashboard.cm', { cm: signed(m.changeCm) });
              const tone = changeTone(m.key, goalKind, m.changeCm);
              return (
                <View
                  key={m.key}
                  style={[styles.tableRow, { borderBottomColor: colors.border }]}
                  accessible
                  accessibilityLabel={`${label}: ${now}, ${change}`}
                  testID={`measurement-${m.key}`}
                >
                  <Text style={styles.flex}>{label}</Text>
                  <Text style={[numeric, styles.cell]}>{now}</Text>
                  <Text
                    style={[
                      numeric,
                      styles.cell,
                      { color: m.changeCm === null ? colors.textMuted : colors[TONE[tone]] },
                    ]}
                  >
                    {change}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {training ? (
        <Card style={styles.stack} testID="body-training">
          <Text variant="label">{t('bodyAddon.dashboard.training.title')}</Text>
          {(['run', 'bike', 'swim', 'strength', 'other'] as const)
            .filter((g) => training.groups[g].planned > 0)
            .map((g) => (
              <View key={g} style={styles.row}>
                <Text tone="secondary" style={styles.flex}>
                  {t(`bodyAddon.dashboard.training.${g}`)}
                </Text>
                <Text style={numeric}>
                  {t('bodyAddon.dashboard.training.count', {
                    done: training.groups[g].done,
                    planned: training.groups[g].planned,
                  })}
                </Text>
              </View>
            ))}
          {training.planned === 0 ? (
            <Text tone="secondary">{t('bodyAddon.dashboard.training.none')}</Text>
          ) : (
            <Text variant="caption" tone="secondary" style={numeric}>
              {t('bodyAddon.dashboard.training.minutes', { minutes: training.minutesDone })}
            </Text>
          )}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  tight: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: { minWidth: 72, textAlign: 'right' },
  caps: { textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
});
