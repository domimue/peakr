import { progressOf, quickAdd, sumNutrients } from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import type { FoodEntry } from '@/data/repositories/body-repository';
import type { AddonGuard } from '@/features/billing/model';
import {
  Button,
  Card,
  ChipGroup,
  ListState,
  numeric,
  ProgressRing,
  spacing,
  Text,
  TextField,
} from '@/ui';

import { useCopyEntries } from '../food/queries';
import { MEALS, type Meal } from '../meals';
import { useBodyModel } from '../model';
import {
  useAddFood,
  useDeleteFood,
  useFoodDay,
  useIncompleteDays,
  useSetDayIncomplete,
} from '../queries';

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

/** "150 g", "2 pieces", "1 × 1 bar (45 g)". */
function amountText(e: FoodEntry, t: TFunction): string | null {
  if (e.amount === null || e.unit === null) return null;
  if (e.unit === 'portion')
    return t('bodyAddon.food.portionCount', { count: e.amount, label: e.portionLabel });
  if (e.unit === 'piece') return t('bodyAddon.food.pieces', { count: e.amount });
  return `${e.amount} ${e.unit}`;
}

/**
 * Body → Today: the nutrition diary. Remaining kcal with the energy today's workouts add back,
 * rings for kcal and macros against the goal's targets, meals with their entries, quick add,
 * copying a meal or a whole day, fuelling hints for long sessions and the "incomplete" marker.
 * Read-only after the add-on ended: entries stay, adding and deleting are locked.
 */
export function DiarySection({ guard }: { guard: AddonGuard }) {
  const { t } = useTranslation();
  const today = todayIso();
  const food = useFoodDay(today);
  const model = useBodyModel();
  const add = useAddFood();
  const remove = useDeleteFood();
  const copy = useCopyEntries();
  const incomplete = useIncompleteDays();
  const setIncomplete = useSetDayIncomplete();
  const markedIncomplete = (incomplete.data ?? []).includes(today);
  const [quickMeal, setQuickMeal] = useState<Meal>('snack');
  const [quick, setQuick] = useState({ kcal: '', protein: '', carbs: '', fat: '' });
  const [message, setMessage] = useState<string | null>(null);

  if (food.isPending) return <ListState kind="loading" label={t('common.loading')} />;
  const entries = food.data ?? [];
  const kcal = parse(quick.kcal);

  const copyFromYesterday = (meal?: Meal) =>
    copy.mutate(
      { fromDay: shift(today, -1), toDay: today, meal },
      {
        onSuccess: (copies) =>
          setMessage(
            copies.length
              ? t('bodyAddon.diary.copied', { count: copies.length })
              : t('bodyAddon.diary.nothingToCopy'),
          ),
      },
    );

  return (
    <View style={styles.stack} testID="body-diary">
      <Card style={styles.stack}>
        <Text variant="heading">{t('bodyAddon.energy.title')}</Text>
        {model && !model.goal && guard.canWrite ? (
          <Button
            small
            variant="secondary"
            testID="body-set-goal"
            label={t('bodyAddon.goal.set')}
            onPress={() => router.push('/body/goal')}
          />
        ) : null}
        {model ? (
          <>
            <Text variant="title" style={numeric}>
              {model.remainingKcal >= 0
                ? t('bodyAddon.energy.remaining', { kcal: model.remainingKcal })
                : t('bodyAddon.energy.over', { kcal: -model.remainingKcal })}
            </Text>
            {model.addedBack.kcal > 0 ? (
              <Text testID="body-added-back" style={numeric}>
                {model.addedBack.sport
                  ? t('bodyAddon.diary.addedBackSport', {
                      sport: t(`bodyAddon.diary.sport.${model.addedBack.sport}`, {
                        defaultValue: t('bodyAddon.diary.sport.other'),
                      }),
                      kcal: model.addedBack.kcal,
                    })
                  : t('bodyAddon.diary.addedBack', { kcal: model.addedBack.kcal })}
              </Text>
            ) : null}
            <View style={styles.rings} testID="body-rings">
              {(
                [
                  ['kcal', model.eaten.kcal, model.macros.kcal, 'kcal'],
                  ['protein', model.eaten.proteinG, model.macros.proteinG, 'g'],
                  ['carbs', model.eaten.carbsG, model.macros.carbsG, 'g'],
                  ['fat', model.eaten.fatG, model.macros.fatG, 'g'],
                ] as const
              ).map(([key, eaten, target, unit]) => (
                <ProgressRing
                  key={key}
                  testID={`ring-${key}`}
                  share={progressOf(eaten, target).share}
                  label={t(`bodyAddon.diary.rings.${key}`)}
                  value={String(Math.round(eaten))}
                  caption={t('bodyAddon.diary.of', { target, unit })}
                />
              ))}
            </View>
            {model.floorApplied ? (
              <Text variant="caption" tone="secondary">
                {t('bodyAddon.energy.floor')}
              </Text>
            ) : null}
            {model.today.intakeSource && model.today.intakeSource !== 'manual' ? (
              <Text variant="caption" tone="secondary">
                {t('bodyAddon.energy.intakeFrom', {
                  source: t(`bodyAddon.sources.${model.today.intakeSource}`),
                })}
              </Text>
            ) : null}
            <Text variant="caption" tone="secondary">
              {t('bodyAddon.energy.estimate')}
            </Text>
          </>
        ) : null}
      </Card>

      {model?.fuelling.map((h) => (
        <Card key={`${h.date}-${h.sport}`} style={styles.stack} testID="body-fuelling">
          <Text variant="label">
            {t(h.date === today ? 'bodyAddon.fuelling.today' : 'bodyAddon.fuelling.tomorrow', {
              minutes: h.durationMin,
            })}
          </Text>
          {h.hints.map((k) => (
            <Text key={k} tone="secondary">
              {t(`bodyAddon.fuelling.${k}`, {
                min: h.duringCarbsPerHour?.min,
                max: h.duringCarbsPerHour?.max,
              })}
            </Text>
          ))}
          <Text variant="caption" tone="secondary">
            {t('bodyAddon.fuelling.note')}
          </Text>
        </Card>
      ))}

      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m);
        const total = sumNutrients(
          list.map((e) => ({
            kcal: e.kcal,
            proteinG: e.proteinG ?? 0,
            carbsG: e.carbsG ?? 0,
            fatG: e.fatG ?? 0,
          })),
        );
        return (
          <Card key={m} style={styles.stack} testID={`meal-${m}`}>
            <View style={styles.row}>
              <Text variant="label" style={styles.flex}>
                {t(`bodyAddon.meals.${m}`)}
              </Text>
              <Text style={numeric}>{t('bodyAddon.kcal', { kcal: total.kcal })}</Text>
            </View>
            {list.map((e) => (
              <View key={e.id} style={styles.row}>
                <View style={styles.flex}>
                  <Text>{e.name}</Text>
                  <Text variant="caption" tone="secondary" style={numeric}>
                    {[
                      amountText(e, t),
                      e.proteinG !== null
                        ? t('bodyAddon.diary.macros', {
                            p: e.proteinG,
                            c: e.carbsG ?? 0,
                            f: e.fatG ?? 0,
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
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
            {guard.canWrite ? (
              <View style={styles.actions}>
                <Button
                  small
                  variant="secondary"
                  icon="plus"
                  testID={`add-${m}`}
                  label={t('bodyAddon.diary.addFood')}
                  onPress={() =>
                    router.push({ pathname: '/body/food/add', params: { meal: m, day: today } })
                  }
                />
                <Button
                  small
                  variant="secondary"
                  icon="copy"
                  label={t('bodyAddon.diary.copyMeal')}
                  onPress={() => copyFromYesterday(m)}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
      {entries.length === 0 ? <Text tone="secondary">{t('bodyAddon.diary.empty')}</Text> : null}

      {guard.canWrite ? (
        <>
          <Card style={styles.stack} testID="body-quick-add">
            <Text variant="heading">{t('bodyAddon.diary.quickAdd')}</Text>
            <ChipGroup
              label={t('bodyAddon.diary.meal')}
              options={MEALS.map((m) => ({ value: m, label: t(`bodyAddon.meals.${m}`) }))}
              selected={[quickMeal]}
              onToggle={setQuickMeal}
            />
            <TextField
              label={t('bodyAddon.diary.kcal')}
              suffix="kcal"
              keyboardType="number-pad"
              value={quick.kcal}
              onChangeText={(v) => setQuick({ ...quick, kcal: v })}
            />
            <View style={styles.row}>
              {(['protein', 'carbs', 'fat'] as const).map((k) => (
                <View key={k} style={styles.flex}>
                  <TextField
                    label={t(`bodyAddon.diary.rings.${k}`)}
                    suffix="g"
                    keyboardType="decimal-pad"
                    value={quick[k]}
                    onChangeText={(v) => setQuick({ ...quick, [k]: v })}
                  />
                </View>
              ))}
            </View>
            <Button
              variant="secondary"
              label={t('bodyAddon.diary.save')}
              icon="plus"
              disabled={kcal === null || kcal > 10000 || add.isPending}
              onPress={() => {
                if (kcal === null) return;
                const n = quickAdd({
                  kcal,
                  proteinG: parse(quick.protein) ?? undefined,
                  carbsG: parse(quick.carbs) ?? undefined,
                  fatG: parse(quick.fat) ?? undefined,
                });
                const anyMacro = [quick.protein, quick.carbs, quick.fat].some(
                  (v) => v.trim() !== '',
                );
                add.mutate(
                  {
                    day: today,
                    meal: quickMeal,
                    name: t('bodyAddon.diary.quickName'),
                    kcal: n.kcal,
                    proteinG: anyMacro ? n.proteinG : null,
                    carbsG: anyMacro ? n.carbsG : null,
                    fatG: anyMacro ? n.fatG : null,
                  },
                  { onSuccess: () => setQuick({ kcal: '', protein: '', carbs: '', fat: '' }) },
                );
              }}
            />
          </Card>
          <Button
            small
            variant="secondary"
            icon="copy"
            testID="body-copy-day"
            label={t('bodyAddon.diary.copyDay')}
            onPress={() => copyFromYesterday()}
          />
          <Button
            small
            variant="secondary"
            testID="body-day-incomplete"
            label={t(
              markedIncomplete ? 'bodyAddon.diary.incompleteUndo' : 'bodyAddon.diary.incomplete',
            )}
            onPress={() => setIncomplete.mutate({ day: today, incomplete: !markedIncomplete })}
          />
        </>
      ) : null}
      {message ? <Text tone="secondary">{message}</Text> : null}
      {markedIncomplete ? (
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.diary.incompleteHint')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rings: { flexDirection: 'row', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
});
