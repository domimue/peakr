import {
  EQUIPMENT,
  EXERCISE_PATTERNS,
  exercises,
  validateCustomExercise,
  type CustomExercise,
  type Equipment,
  type ExercisePattern,
  type LegLoad,
} from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { newId } from '@/data/ids';
import {
  Button,
  Card,
  ChipGroup,
  radius,
  SegmentedControl,
  spacing,
  Text,
  TextField,
  useTheme,
} from '@/ui';

import { exerciseName } from './session';

type PatternFilter = ExercisePattern | 'all';

export interface ExercisePickerProps {
  custom: readonly CustomExercise[];
  onPick: (exerciseId: string) => void;
  onCreate: (exercise: CustomExercise) => void;
  onCancel: () => void;
}

/** Searchable exercise library (§8.6) plus the user's own exercises. */
export function ExercisePicker({ custom, onPick, onCreate, onCancel }: ExercisePickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [pattern, setPattern] = useState<PatternFilter>('all');
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <CustomExerciseForm
        onSave={(exercise) => {
          onCreate(exercise);
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const all = [...custom, ...exercises];
  const shown = all.filter(
    (e) =>
      (pattern === 'all' || e.pattern === pattern) &&
      (q === '' || exerciseName(t, e.id, custom).toLowerCase().includes(q)),
  );

  return (
    <View style={styles.picker}>
      <Text variant="heading">{t('strength.picker.title')}</Text>
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
      {shown.length === 0 ? <Text tone="secondary">{t('strength.picker.empty')}</Text> : null}
      {shown.map((e) => (
        <ExerciseRow
          key={e.id}
          name={exerciseName(t, e.id, custom)}
          detail={[
            t(`strength.patterns.${e.pattern}`),
            e.equipment.map((x) => t(`strength.equipment.${x}`)).join(', '),
          ].join(' · ')}
          onPress={() => onPick(e.id)}
        />
      ))}
    </View>
  );
}

function ExerciseRow({
  name,
  detail,
  onPress,
}: {
  name: string;
  detail: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surface2 : colors.surface },
      ]}
    >
      <Text style={styles.rowTitle}>{name}</Text>
      <Text variant="caption" tone="secondary">
        {detail}
      </Text>
    </Pressable>
  );
}

const LEG_LOADS: LegLoad[] = ['none', 'light', 'heavy'];

/** "Add your own exercise": name, movement pattern, equipment and how hard it is on the legs. */
export function CustomExerciseForm({
  onSave,
  onCancel,
}: {
  onSave: (exercise: CustomExercise) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState<ExercisePattern>('squat');
  const [equipment, setEquipment] = useState<Equipment[]>(['bodyweight']);
  const [legLoad, setLegLoad] = useState<LegLoad>('light');
  const [submitted, setSubmitted] = useState(false);

  const result = validateCustomExercise({ id: newId(), name, pattern, equipment, legLoad });
  const issue = (field: 'name' | 'equipment') =>
    submitted && !result.ok && result.issues.some((i) => i.field === field)
      ? t('validation.required')
      : undefined;

  return (
    <Card>
      <Text variant="heading">{t('strength.custom.title')}</Text>
      <TextField
        label={t('strength.custom.name')}
        value={name}
        onChangeText={setName}
        error={issue('name')}
      />
      <ChipGroup
        label={t('strength.picker.pattern')}
        options={EXERCISE_PATTERNS.map((p) => ({ value: p, label: t(`strength.patterns.${p}`) }))}
        selected={[pattern]}
        onToggle={setPattern}
      />
      <ChipGroup
        label={t('strength.custom.equipment')}
        multiple
        options={EQUIPMENT.map((e) => ({ value: e, label: t(`strength.equipment.${e}`) }))}
        selected={equipment}
        onToggle={(e) =>
          setEquipment(equipment.includes(e) ? equipment.filter((x) => x !== e) : [...equipment, e])
        }
        error={issue('equipment')}
      />
      <Text variant="caption" style={styles.label}>
        {t('strength.custom.legLoad')}
      </Text>
      <SegmentedControl
        options={LEG_LOADS.map((l) => ({ value: l, label: t(`strength.legLoad.${l}`) }))}
        value={legLoad}
        onChange={setLegLoad}
      />
      <Text variant="caption" tone="secondary">
        {t('strength.custom.legLoadHint')}
      </Text>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button variant="secondary" label={t('common.cancel')} onPress={onCancel} />
        </View>
        <View style={styles.action}>
          <Button
            label={t('strength.custom.save')}
            onPress={() => {
              setSubmitted(true);
              if (result.ok) onSave(result.value);
            }}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  picker: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  row: { borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
  rowTitle: { fontWeight: '600' },
  label: { fontWeight: '600' },
});
