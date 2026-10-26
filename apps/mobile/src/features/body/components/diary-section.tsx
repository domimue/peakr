import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { MEALS, type Meal } from '../meals';
import type { AddonGuard } from '@/features/billing/model';
import { Button, Card, ChipGroup, ListState, numeric, spacing, Text, TextField } from '@/ui';

import { useAddFood, useDeleteFood, useEnergyToday, useFoodDay } from '../queries';

/**
 * Body → Today: the day's food diary under "Energy today". Read-only after the add-on ended: the
 * entries stay visible, adding and deleting are locked (the server refuses them too).
 */
export function DiarySection({ guard }: { guard: AddonGuard }) {
  const { t } = useTranslation();
  const today = todayIso();
  const food = useFoodDay(today);
  const energy = useEnergyToday();
  const add = useAddFood();
  const remove = useDeleteFood();
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const kcalValue = Number(kcal);
  const valid =
    name.trim().length > 0 && kcal !== '' && Number.isInteger(kcalValue) && kcalValue <= 10000;

  if (food.isPending) return <ListState kind="loading" label={t('common.loading')} />;
  const entries = food.data ?? [];

  return (
    <View style={styles.stack} testID="body-diary">
      <Card style={styles.stack}>
        <Text variant="heading">{t('bodyAddon.energy.title')}</Text>
        {energy ? (
          <>
            <Text variant="title" style={numeric}>
              {energy.remainingKcal >= 0
                ? t('bodyAddon.energy.remaining', { kcal: energy.remainingKcal })
                : t('bodyAddon.energy.over', { kcal: -energy.remainingKcal })}
            </Text>
            <Text tone="secondary" style={numeric}>
              {t('bodyAddon.energy.breakdown', {
                target: energy.targetKcal,
                eaten: energy.intakeKcal,
                workouts: energy.workoutKcal,
              })}
            </Text>
            {energy.floorApplied ? (
              <Text variant="caption" tone="secondary">
                {t('bodyAddon.energy.floor')}
              </Text>
            ) : null}
            <Text variant="caption" tone="secondary">
              {t('bodyAddon.energy.estimate')}
            </Text>
          </>
        ) : null}
      </Card>

      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m);
        if (list.length === 0) return null;
        return (
          <Card key={m} style={styles.stack}>
            <Text variant="label">{t(`bodyAddon.meals.${m}`)}</Text>
            {list.map((e) => (
              <View key={e.id} style={styles.row}>
                <Text style={styles.flex}>{e.name}</Text>
                <Text style={numeric}>{t('bodyAddon.kcal', { kcal: e.kcal })}</Text>
                {guard.canWrite ? (
                  <Button
                    small
                    variant="secondary"
                    icon="trash"
                    label={t('bodyAddon.diary.delete')}
                    onPress={() => remove.mutate(e.id)}
                  />
                ) : null}
              </View>
            ))}
          </Card>
        );
      })}
      {entries.length === 0 ? <Text tone="secondary">{t('bodyAddon.diary.empty')}</Text> : null}

      {guard.canWrite ? (
        <Card style={styles.stack} testID="body-diary-add">
          <Text variant="heading">{t('bodyAddon.diary.add')}</Text>
          <ChipGroup
            label={t('bodyAddon.diary.meal')}
            options={MEALS.map((m) => ({ value: m, label: t(`bodyAddon.meals.${m}`) }))}
            selected={[meal]}
            onToggle={setMeal}
          />
          <TextField label={t('bodyAddon.diary.name')} value={name} onChangeText={setName} />
          <TextField
            label={t('bodyAddon.diary.kcal')}
            suffix="kcal"
            keyboardType="number-pad"
            value={kcal}
            onChangeText={setKcal}
          />
          <Button
            label={t('bodyAddon.diary.save')}
            icon="plus"
            disabled={!valid || add.isPending}
            onPress={() =>
              add.mutate(
                { day: today, meal, name: name.trim(), kcal: kcalValue, proteinG: null },
                {
                  onSuccess: () => {
                    setName('');
                    setKcal('');
                  },
                },
              )
            }
          />
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
