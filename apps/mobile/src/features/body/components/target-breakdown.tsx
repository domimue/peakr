import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, numeric, spacing, Text } from '@/ui';

import type { BodyModel } from '../model';

/**
 * How today's target is built (CLAUDE.md "Energy & body rules"): resting energy, everyday
 * activity, today's planned training and the goal's deficit – plus the notices that belong to the
 * target: a goal pace that would break the intake floor, training clearly off the plan this week,
 * and the everyday activity not answered yet. Every number comes from the engine.
 */
export function TargetBreakdown({ model }: { model: BodyModel }) {
  const { t } = useTranslation();
  const b = model.breakdown;
  const kcal = (v: number) => t('bodyAddon.energy.kcal', { kcal: v });
  return (
    <View style={styles.wrap} testID="target-breakdown">
      {model.belowFloor ? (
        <View style={styles.notice} testID="target-below-floor">
          <Text>{t('bodyAddon.energy.belowFloorBanner', model.belowFloor)}</Text>
          <Button
            small
            variant="secondary"
            label={t('bodyAddon.energy.fixGoal')}
            onPress={() => router.push('/body/goal')}
          />
        </View>
      ) : null}
      {b ? (
        <>
          <Text variant="label">{t('bodyAddon.energy.breakdownTitle')}</Text>
          <Line label={t('bodyAddon.energy.resting')} value={kcal(b.restingKcal)} />
          <Line label={t('bodyAddon.energy.everydayLine')} value={`+ ${kcal(b.everydayKcal)}`} />
          <Line label={t('bodyAddon.energy.training')} value={`+ ${kcal(b.trainingKcal)}`} />
          {b.deficitKcal !== 0 ? (
            <Line
              label={t(b.deficitKcal > 0 ? 'bodyAddon.energy.deficit' : 'bodyAddon.energy.surplus')}
              value={`${b.deficitKcal > 0 ? '−' : '+'} ${kcal(Math.abs(b.deficitKcal))}`}
            />
          ) : null}
          <Line label={t('bodyAddon.energy.total')} value={kcal(b.totalKcal)} strong />
        </>
      ) : null}
      {model.deviation?.hint ? (
        <Text variant="caption" testID="target-deviation">
          {t(
            model.deviation.hint === 'more'
              ? 'bodyAddon.energy.deviationMore'
              : 'bodyAddon.energy.deviationLess',
            { kcal: Math.abs(model.deviation.differenceKcal) },
          )}
        </Text>
      ) : null}
      {model.energy.everydayActivity === null ? (
        <Text variant="caption" tone="secondary" testID="target-everyday-unset">
          {t('bodyAddon.energy.everydayUnset')}
        </Text>
      ) : null}
      <Button
        small
        variant="secondary"
        icon="tune"
        label={t('bodyAddon.energy.editSettings')}
        onPress={() => router.push('/body/energy')}
      />
    </View>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={styles.flex} variant={strong ? 'label' : 'body'}>
        {label}
      </Text>
      <Text style={numeric} variant={strong ? 'label' : 'body'}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  notice: { gap: spacing.xs },
  line: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
