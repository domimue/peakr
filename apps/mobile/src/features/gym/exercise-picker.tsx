import {
  EQUIPMENT,
  EXERCISE_PATTERNS,
  type CustomExercise,
  type Equipment,
  type Exercise,
  type ExercisePattern,
} from '@peakr/engine';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, ChipGroup, radius, spacing, Text, TextField, useTheme } from '@/ui';

import { ExerciseForm } from './exercise-form';
import { allExercises, exerciseTexts, searchExercises } from './exercise-text';
import { ExerciseFigure } from './figures/exercise-figure';

type Filter<T extends string> = T | 'all';

export interface ExercisePickerProps {
  custom: readonly CustomExercise[];
  onPick: (exerciseId: string) => void;
  onCreate: (exercise: CustomExercise) => void;
  onCancel: () => void;
}

/** Searchable exercise library (§8.6) plus the user's own exercises, for routines and imports. */
export function ExercisePicker({ custom, onPick, onCreate, onCancel }: ExercisePickerProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <ExerciseForm
        onSave={(exercise) => {
          onCreate(exercise);
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }
  return (
    <View style={styles.picker}>
      <Text variant="heading">{t('strength.picker.title')}</Text>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            variant="secondary"
            label={t('strength.picker.createCustom')}
            onPress={() => setCreating(true)}
          />
        </View>
        <View style={styles.action}>
          <Button variant="secondary" label={t('common.cancel')} onPress={onCancel} />
        </View>
      </View>
      <ExerciseBrowser custom={custom} onOpen={onPick} />
    </View>
  );
}

/** Search field, movement and equipment filters and the matching exercises. */
export function ExerciseBrowser({
  custom,
  onOpen,
}: {
  custom: readonly CustomExercise[];
  onOpen: (exerciseId: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [pattern, setPattern] = useState<Filter<ExercisePattern>>('all');
  const [equipment, setEquipment] = useState<Filter<Equipment>>('all');
  const shown = useMemo(
    () =>
      searchExercises(t, allExercises(custom), {
        query,
        ...(pattern !== 'all' ? { pattern } : {}),
        ...(equipment !== 'all' ? { equipment } : {}),
      }),
    [t, custom, query, pattern, equipment],
  );

  return (
    <View style={styles.picker}>
      <TextField
        label={t('strength.picker.search')}
        value={query}
        onChangeText={setQuery}
        placeholder={t('strength.picker.searchPlaceholder')}
        autoCorrect={false}
      />
      <ChipGroup
        label={t('strength.picker.pattern')}
        options={[
          { value: 'all' as const, label: t('strength.picker.all') },
          ...EXERCISE_PATTERNS.map((p) => ({ value: p, label: t(`strength.patterns.${p}`) })),
        ]}
        selected={[pattern]}
        onToggle={setPattern}
      />
      <ChipGroup
        label={t('strength.picker.equipment')}
        options={[
          { value: 'all' as const, label: t('strength.picker.all') },
          ...EQUIPMENT.map((e) => ({ value: e, label: t(`strength.equipment.${e}`) })),
        ]}
        selected={[equipment]}
        onToggle={setEquipment}
      />
      <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
        {t('gym.library.count', { count: shown.length })}
      </Text>
      {shown.length === 0 ? <Text tone="secondary">{t('strength.picker.empty')}</Text> : null}
      {shown.map((e) => (
        <ExerciseRow key={e.id} exercise={e} onPress={() => onOpen(e.id)} />
      ))}
    </View>
  );
}

export function ExerciseRow({
  exercise,
  onPress,
}: {
  exercise: Exercise | CustomExercise;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const name = exerciseTexts(t, exercise).name;
  const detail = [
    t(`strength.patterns.${exercise.pattern}`),
    exercise.equipment.map((x) => t(`strength.equipment.${x}`)).join(', '),
  ].join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surface2 : colors.surface },
      ]}
    >
      <ExerciseFigure exercise={exercise} size={48} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{name}</Text>
        <Text variant="caption" tone="secondary">
          {'name' in exercise ? `${t('gym.library.custom')} · ${detail}` : detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  picker: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    minHeight: 48,
  },
  flex: { flex: 1, gap: 2 },
  rowTitle: { fontWeight: '600' },
});
