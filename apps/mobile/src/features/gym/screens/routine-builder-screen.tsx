import { defaultRestSec, type Routine, type RoutineExercise } from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { newId } from '@/data/ids';
import { Button, Card, Screen, spacing, Stepper, Text, TextField } from '@/ui';

import { ExercisePicker } from '../exercise-picker';
import {
  useCustomExercises,
  useDeleteRoutine,
  useRoutines,
  useSaveCustomExercise,
  useSaveRoutine,
} from '../queries';
import { exerciseName } from '../session';

interface Draft {
  key: string;
  exerciseId?: string;
  name?: string;
  sets: number;
  reps: string;
  weight: string;
  restSec: number;
}

const DEFAULT_REPS = '8–12';

function toDraft(e: RoutineExercise): Draft {
  return {
    key: newId(),
    exerciseId: e.exerciseId,
    name: e.name,
    sets: e.sets,
    reps: e.reps,
    weight: e.weightKg === undefined ? '' : String(e.weightKg),
    restSec: e.restSec ?? defaultRestSec(e.exerciseId ?? '', e.reps),
  };
}

/** Parses a weight field ("62,5" or "62.5"); empty = bodyweight. */
function parseWeight(text: string): number | undefined | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}

export function RoutineBuilderScreen({ id }: { id: string }) {
  const routines = useRoutines();
  if (routines.isPending) return <Screen />;
  const existing = id === 'new' ? undefined : routines.data?.find((r) => r.id === id);
  return <RoutineBuilder existing={existing} />;
}

/** Build or edit a routine: exercises, sets, reps or time, weight and rest (§8.1). */
function RoutineBuilder({ existing }: { existing: Routine | undefined }) {
  const { t } = useTranslation();
  const custom = useCustomExercises().data ?? [];
  const saveCustom = useSaveCustomExercise();
  const save = useSaveRoutine();
  const remove = useDeleteRoutine();

  const [name, setName] = useState(existing?.name ?? '');
  const [durationMin, setDurationMin] = useState(existing?.durationMin ?? 45);
  const [items, setItems] = useState<Draft[]>(existing?.exercises.map(toDraft) ?? []);
  const [picking, setPicking] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (key: string, patch: Partial<Draft>) =>
    setItems((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const move = (index: number, by: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + by, 0, item);
      return next;
    });
  const add = (exerciseId: string) => {
    setItems((list) => [
      ...list,
      {
        key: newId(),
        exerciseId,
        sets: 3,
        reps: DEFAULT_REPS,
        weight: '',
        restSec: defaultRestSec(exerciseId, DEFAULT_REPS),
      },
    ]);
    setPicking(false);
  };

  if (picking) {
    return (
      <Screen>
        <ExercisePicker
          custom={custom}
          onPick={add}
          onCreate={(exercise) =>
            saveCustom.mutate(exercise, { onSuccess: () => add(exercise.id) })
          }
          onCancel={() => setPicking(false)}
        />
      </Screen>
    );
  }

  const nameError = name.trim() === '' ? t('validation.required') : undefined;
  const repsError = (d: Draft) => (d.reps.trim() === '' ? t('validation.required') : undefined);
  const weightError = (d: Draft) =>
    parseWeight(d.weight) === null ? t('strength.builder.weightInvalid') : undefined;
  const valid =
    !nameError && items.length > 0 && items.every((d) => !repsError(d) && !weightError(d));

  const onSave = () => {
    setSubmitted(true);
    if (!valid) return;
    const routine: Routine = {
      id: existing?.id ?? newId(),
      name: name.trim(),
      durationMin,
      exercises: items.map((d) => ({
        exerciseId: d.exerciseId,
        name: d.name,
        sets: d.sets,
        reps: d.reps.trim(),
        weightKg: parseWeight(d.weight) ?? undefined,
        restSec: d.restSec,
      })),
    };
    save.mutate(routine, { onSuccess: () => router.back() });
  };

  return (
    <Screen>
      <TextField
        label={t('strength.builder.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('strength.builder.namePlaceholder')}
        error={submitted ? nameError : undefined}
      />
      <Stepper
        label={t('strength.builder.duration')}
        value={durationMin}
        min={10}
        max={150}
        step={5}
        onChange={setDurationMin}
        format={(n) => t('strength.minutes', { count: n })}
        decreaseLabel={t('common.decrease')}
        increaseLabel={t('common.increase')}
      />

      <Text variant="heading">{t('strength.builder.exercises')}</Text>
      {items.length === 0 ? (
        <Text tone={submitted ? 'default' : 'secondary'}>{t('strength.builder.noExercises')}</Text>
      ) : null}
      {items.map((d, i) => {
        const title = exerciseName(t, d.exerciseId ?? '', custom, d.name);
        return (
          <Card key={d.key} accessibilityLabel={title}>
            <Text style={styles.title}>{`${i + 1}. ${title}`}</Text>
            <Stepper
              label={t('strength.builder.sets')}
              value={d.sets}
              min={1}
              max={10}
              onChange={(sets) => update(d.key, { sets })}
              decreaseLabel={t('common.decrease')}
              increaseLabel={t('common.increase')}
            />
            <View style={styles.fields}>
              <View style={styles.field}>
                <TextField
                  label={t('strength.builder.reps')}
                  value={d.reps}
                  onChangeText={(reps) => update(d.key, { reps })}
                  hint={t('strength.builder.repsHint')}
                  error={submitted ? repsError(d) : undefined}
                />
              </View>
              <View style={styles.field}>
                <TextField
                  label={t('strength.builder.weight')}
                  value={d.weight}
                  onChangeText={(weight) => update(d.key, { weight })}
                  keyboardType="decimal-pad"
                  suffix={t('units.kg')}
                  placeholder={t('strength.builder.bodyweight')}
                  error={weightError(d)}
                />
              </View>
            </View>
            <Stepper
              label={t('strength.builder.rest')}
              value={d.restSec}
              min={0}
              max={300}
              step={15}
              onChange={(restSec) => update(d.key, { restSec })}
              format={(n) => t('strength.seconds', { count: n })}
              decreaseLabel={t('common.decrease')}
              increaseLabel={t('common.increase')}
            />
            <View style={styles.rowActions}>
              <Button
                small
                variant="secondary"
                label={t('strength.builder.up')}
                disabled={i === 0}
                onPress={() => move(i, -1)}
              />
              <Button
                small
                variant="secondary"
                label={t('strength.builder.down')}
                disabled={i === items.length - 1}
                onPress={() => move(i, 1)}
              />
              <Button
                small
                variant="danger"
                label={t('strength.builder.remove')}
                onPress={() => setItems((list) => list.filter((x) => x.key !== d.key))}
              />
            </View>
          </Card>
        );
      })}
      <Button
        variant="secondary"
        label={t('strength.builder.addExercise')}
        onPress={() => setPicking(true)}
      />
      <Button label={t('strength.builder.save')} disabled={save.isPending} onPress={onSave} />
      {existing ? (
        <Button
          variant="danger"
          label={t('strength.builder.delete')}
          onPress={() => remove.mutate(existing.id, { onSuccess: () => router.back() })}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '600' },
  fields: { flexDirection: 'row', gap: spacing.sm },
  field: { flex: 1 },
  rowActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
});
