import {
  defaultRestSec,
  estimateRoutineMinutes,
  groupSuperset,
  moveRoutineExercise,
  targetFromText,
  targetToText,
  ungroupSuperset,
  type GymRoutine,
  type GymRoutineExercise,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { newId } from '@/data/ids';
import {
  Badge,
  Button,
  Card,
  ChipGroup,
  Screen,
  SortableList,
  spacing,
  Stepper,
  Text,
  TextField,
  useTheme,
} from '@/ui';

import { ExercisePicker } from '../exercise-picker';
import {
  useDeleteGymRoutine,
  useFolders,
  useGymExercises,
  useGymRoutines,
  useSaveGymExercise,
  useSaveGymRoutines,
} from '../queries';
import { exerciseName } from '../session';

const DEFAULT_TARGET = '8–12';

/** An entry while editing: number fields stay text until saved. */
interface Draft extends Omit<GymRoutineExercise, 'target' | 'weightKg' | 'targetRpe'> {
  target: string;
  weight: string;
  rpe: string;
}

function toDraft(e: GymRoutineExercise): Draft {
  const { target, weightKg, targetRpe, ...rest } = e;
  return {
    ...rest,
    target: targetToText(target),
    weight: weightKg === undefined ? '' : String(weightKg),
    rpe: targetRpe === undefined ? '' : String(targetRpe),
  };
}

/** Parses an optional number field ("62,5" or "62.5"); empty = undefined, invalid = null. */
function parseOptional(text: string, max: number): number | undefined | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

function fromDraft(d: Draft): GymRoutineExercise | null {
  const target = targetFromText(d.target);
  const weightKg = parseOptional(d.weight, 999);
  const targetRpe = parseOptional(d.rpe, 10);
  if (!target || weightKg === null || targetRpe === null) return null;
  return {
    id: d.id,
    exerciseId: d.exerciseId,
    targetSets: d.targetSets,
    restSec: d.restSec,
    target,
    ...(d.supersetGroup ? { supersetGroup: d.supersetGroup } : {}),
    ...(d.targetRir !== undefined ? { targetRir: d.targetRir } : {}),
    ...(d.legLoad ? { legLoad: d.legLoad } : {}),
    ...(weightKg !== undefined ? { weightKg } : {}),
    ...(targetRpe !== undefined ? { targetRpe } : {}),
    ...(d.notes?.trim() ? { notes: d.notes.trim() } : {}),
  };
}

export function RoutineBuilderScreen({ id, folderId }: { id: string; folderId?: string }) {
  const routines = useGymRoutines();
  if (routines.isPending) return <Screen />;
  const existing = id === 'new' ? undefined : routines.data?.find((r) => r.id === id);
  return (
    <RoutineBuilder
      existing={existing}
      folderId={existing?.folderId ?? folderId}
      position={existing?.position ?? routines.data?.length ?? 0}
    />
  );
}

/** Build or edit a routine: exercises, targets, rest, RPE, notes and supersets. */
function RoutineBuilder({
  existing,
  folderId: initialFolder,
  position,
}: {
  existing: GymRoutine | undefined;
  folderId: string | undefined;
  position: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const custom = useGymExercises().data ?? [];
  const folders = useFolders().data ?? [];
  const saveCustom = useSaveGymExercise();
  const save = useSaveGymRoutines();
  const remove = useDeleteGymRoutine();

  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [folderId, setFolderId] = useState(initialFolder ?? 'none');
  const [items, setItems] = useState<Draft[]>(existing?.exercises.map(toDraft) ?? []);
  const [durationMin, setDurationMin] = useState<number | undefined>(existing?.durationMin);
  const [picking, setPicking] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const parsed = items.map(fromDraft);
  const complete = parsed.filter((e): e is GymRoutineExercise => e !== null);
  const estimate = estimateRoutineMinutes(complete);

  const update = (key: string, patch: Partial<Draft>) =>
    setItems((list) => list.map((d) => (d.id === key ? { ...d, ...patch } : d)));
  const restructure = (fn: (list: Draft[]) => Draft[]) => setItems(fn);
  const add = (exerciseId: string) => {
    setItems((list) => [
      ...list,
      {
        id: newId(),
        exerciseId,
        targetSets: 3,
        target: DEFAULT_TARGET,
        weight: '',
        rpe: '',
        restSec: defaultRestSec(exerciseId, DEFAULT_TARGET),
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
  const valid = !nameError && items.length > 0 && parsed.every((e) => e !== null);
  const groupLabel = (group: string) => {
    const groups = [...new Set(items.flatMap((d) => (d.supersetGroup ? [d.supersetGroup] : [])))];
    return t('gym.builder.supersetLabel', {
      letter: String.fromCharCode(65 + groups.indexOf(group)),
    });
  };

  const onSave = () => {
    setSubmitted(true);
    if (!valid) return;
    const routine: GymRoutine = {
      id: existing?.id ?? newId(),
      name: name.trim(),
      position,
      exercises: complete,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(folderId !== 'none' ? { folderId } : {}),
      ...(durationMin !== undefined ? { durationMin } : {}),
      ...(existing?.archivedAt !== undefined ? { archivedAt: existing.archivedAt } : {}),
    };
    save.mutate([routine], { onSuccess: () => router.back() });
  };

  return (
    <Screen>
      <TextField
        label={t('strength.builder.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('strength.builder.namePlaceholder')}
        error={submitted ? nameError : undefined}
        maxLength={60}
      />
      {folders.length > 0 ? (
        <ChipGroup
          label={t('gym.routines.folder')}
          options={[
            { value: 'none', label: t('gym.routines.noFolder') },
            ...folders.map((f) => ({ value: f.id, label: f.name })),
          ]}
          selected={[folderId]}
          onToggle={setFolderId}
        />
      ) : null}
      <TextField label={t('gym.builder.notes')} value={notes} onChangeText={setNotes} multiline />

      <Text variant="heading">{t('strength.builder.exercises')}</Text>
      {items.length === 0 ? (
        <Text tone={submitted ? 'default' : 'secondary'}>{t('strength.builder.noExercises')}</Text>
      ) : null}
      <SortableList
        testID="routine-exercises"
        items={items}
        keyOf={(d) => d.id}
        moveUpLabel={t('gym.builder.moveUp')}
        moveDownLabel={t('gym.builder.moveDown')}
        onMove={(from, to) => restructure((list) => moveRoutineExercise(list, from, to))}
        renderItem={(d, i) => {
          const title = exerciseName(t, d.exerciseId, custom);
          const next = items[i + 1];
          const targetError = targetFromText(d.target) ? undefined : t('gym.builder.targetInvalid');
          return (
            <Card
              accessibilityLabel={title}
              style={[
                styles.card,
                d.supersetGroup
                  ? { borderLeftWidth: 4, borderLeftColor: colors.typeStrength }
                  : null,
              ]}
            >
              <View style={styles.titleRow}>
                <Text style={styles.title}>{`${i + 1}. ${title}`}</Text>
                {d.supersetGroup ? <Badge label={groupLabel(d.supersetGroup)} /> : null}
              </View>
              <Stepper
                label={t('strength.builder.sets')}
                value={d.targetSets}
                min={1}
                max={10}
                onChange={(targetSets) => update(d.id, { targetSets })}
                decreaseLabel={t('common.decrease')}
                increaseLabel={t('common.increase')}
              />
              <View style={styles.fields}>
                <View style={styles.field}>
                  <TextField
                    label={t('strength.builder.reps')}
                    value={d.target}
                    onChangeText={(target) => update(d.id, { target })}
                    hint={t('strength.builder.repsHint')}
                    error={submitted || d.target !== '' ? targetError : undefined}
                  />
                </View>
                <View style={styles.field}>
                  <TextField
                    label={t('strength.builder.weight')}
                    value={d.weight}
                    onChangeText={(weight) => update(d.id, { weight })}
                    keyboardType="decimal-pad"
                    suffix={t('units.kg')}
                    placeholder={t('strength.builder.bodyweight')}
                    error={
                      parseOptional(d.weight, 999) === null
                        ? t('strength.builder.weightInvalid')
                        : undefined
                    }
                  />
                </View>
              </View>
              <View style={styles.fields}>
                <View style={styles.field}>
                  <Stepper
                    label={t('strength.builder.rest')}
                    value={d.restSec}
                    min={0}
                    max={300}
                    step={15}
                    onChange={(restSec) => update(d.id, { restSec })}
                    format={(n) => t('strength.seconds', { count: n })}
                    decreaseLabel={t('common.decrease')}
                    increaseLabel={t('common.increase')}
                  />
                </View>
                <View style={styles.rpe}>
                  <TextField
                    label={t('gym.builder.targetRpe')}
                    value={d.rpe}
                    onChangeText={(rpe) => update(d.id, { rpe })}
                    keyboardType="decimal-pad"
                    error={
                      parseOptional(d.rpe, 10) === null ? t('gym.builder.rpeInvalid') : undefined
                    }
                  />
                </View>
              </View>
              <TextField
                label={t('gym.builder.exerciseNotes')}
                value={d.notes ?? ''}
                onChangeText={(text) => update(d.id, { notes: text })}
              />
              <View style={styles.rowActions}>
                {d.supersetGroup ? (
                  <Button
                    small
                    variant="secondary"
                    label={t('gym.builder.ungroup')}
                    onPress={() =>
                      restructure((list) => ungroupSuperset(list, d.supersetGroup as string))
                    }
                  />
                ) : null}
                {next && (!d.supersetGroup || next.supersetGroup !== d.supersetGroup) ? (
                  <Button
                    small
                    variant="secondary"
                    label={t('gym.builder.supersetWithNext')}
                    onPress={() =>
                      restructure((list) => {
                        const group = d.supersetGroup ?? next.supersetGroup ?? newId();
                        const members = list
                          .filter((e) => e.supersetGroup === group)
                          .map((e) => e.id);
                        return groupSuperset(
                          list,
                          [...new Set([...members, d.id, next.id])],
                          group,
                        );
                      })
                    }
                  />
                ) : null}
                <Button
                  small
                  variant="danger"
                  label={t('strength.builder.remove')}
                  onPress={() => restructure((list) => list.filter((x) => x.id !== d.id))}
                />
              </View>
            </Card>
          );
        }}
      />
      <Button
        variant="secondary"
        icon="plus"
        label={t('strength.builder.addExercise')}
        onPress={() => setPicking(true)}
      />
      <Stepper
        label={t('strength.builder.duration')}
        value={durationMin ?? estimate}
        min={5}
        max={180}
        step={5}
        onChange={setDurationMin}
        format={(n) => t('strength.minutes', { count: n })}
        decreaseLabel={t('common.decrease')}
        increaseLabel={t('common.increase')}
      />
      <Text variant="caption" tone="secondary">
        {t('gym.builder.estimate', { minutes: estimate })}
      </Text>
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
  card: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { fontWeight: '600', flexShrink: 1 },
  fields: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  field: { flex: 1 },
  rpe: { width: 96 },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
});
