import {
  EQUIPMENT,
  EXERCISE_PATTERNS,
  MUSCLE_GROUPS,
  TRACKING_MODES,
  validateCustomExercise,
  type CustomExercise,
  type CustomExerciseInput,
  type Equipment,
  type ExercisePattern,
  type LegLoad,
  type MuscleGroup,
  type TrackingMode,
} from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { newId } from '@/data/ids';
import { Button, Card, ChipGroup, CheckRow, spacing, Text, TextField } from '@/ui';

const LEG_LOADS: LegLoad[] = ['none', 'light', 'heavy'];

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/**
 * A custom exercise, or an editable copy of a library exercise: every field can be changed. The
 * copy keeps a reference to the library exercise it came from.
 */
export function ExerciseForm({
  initial,
  title,
  onSave,
  onCancel,
}: {
  initial?: CustomExerciseInput;
  title?: string;
  onSave: (exercise: CustomExercise) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [id] = useState(() => initial?.id ?? newId());
  const [name, setName] = useState(initial?.name ?? '');
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(', '));
  const [pattern, setPattern] = useState<ExercisePattern>(initial?.pattern ?? 'other');
  const [equipment, setEquipment] = useState<Equipment[]>(initial?.equipment ?? ['machine']);
  const [primary, setPrimary] = useState<MuscleGroup[]>(initial?.primaryMuscles ?? []);
  const [secondary, setSecondary] = useState<MuscleGroup[]>(initial?.secondaryMuscles ?? []);
  const [legLoad, setLegLoad] = useState<LegLoad>(initial?.legLoad ?? 'light');
  const [unilateral, setUnilateral] = useState(initial?.unilateral ?? false);
  const [tracking, setTracking] = useState<TrackingMode>(initial?.trackingMode ?? 'weightReps');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [cues, setCues] = useState((initial?.cues ?? []).join('\n'));
  const [mistakes, setMistakes] = useState((initial?.mistakes ?? []).join('\n'));
  const [submitted, setSubmitted] = useState(false);

  const result = validateCustomExercise({
    id,
    name,
    pattern,
    equipment,
    legLoad,
    unilateral,
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    trackingMode: tracking,
    aliases: aliases.split(','),
    instructions,
    cues: lines(cues),
    mistakes: lines(mistakes),
    ...(initial?.basedOn ? { basedOn: initial.basedOn } : {}),
  });
  const issue = (field: 'name' | 'equipment') =>
    submitted && !result.ok && result.issues.some((i) => i.field === field)
      ? t('validation.required')
      : undefined;
  const muscleOptions = MUSCLE_GROUPS.map((m) => ({ value: m, label: t(`gym.muscles.${m}`) }));

  return (
    <Card style={styles.form}>
      <Text variant="heading">{title ?? t('strength.custom.title')}</Text>
      <TextField
        label={t('strength.custom.name')}
        value={name}
        onChangeText={setName}
        error={issue('name')}
        maxLength={60}
      />
      <TextField
        label={t('gym.edit.aliases')}
        hint={t('gym.edit.aliasesHint')}
        value={aliases}
        onChangeText={setAliases}
      />
      <ChipGroup
        label={t('strength.picker.pattern')}
        options={EXERCISE_PATTERNS.map((p) => ({ value: p, label: t(`strength.patterns.${p}`) }))}
        selected={[pattern]}
        onToggle={setPattern}
      />
      <ChipGroup
        label={t('strength.custom.equipment')}
        options={EQUIPMENT.map((e) => ({ value: e, label: t(`strength.equipment.${e}`) }))}
        selected={equipment}
        multiple
        onToggle={(e) => setEquipment((list) => toggle(list, e))}
        error={issue('equipment')}
      />
      <ChipGroup
        label={t('gym.edit.primaryMuscles')}
        options={muscleOptions}
        selected={primary}
        multiple
        onToggle={(m) => {
          setPrimary((list) => toggle(list, m));
          setSecondary((list) => list.filter((x) => x !== m));
        }}
      />
      <ChipGroup
        label={t('gym.edit.secondaryMuscles')}
        options={muscleOptions.filter((o) => !primary.includes(o.value))}
        selected={secondary}
        multiple
        onToggle={(m) => setSecondary((list) => toggle(list, m))}
      />
      <ChipGroup
        label={t('gym.edit.tracking')}
        options={TRACKING_MODES.map((m) => ({ value: m, label: t(`gym.tracking.${m}`) }))}
        selected={[tracking]}
        onToggle={setTracking}
      />
      <ChipGroup
        label={t('strength.custom.legLoad')}
        options={LEG_LOADS.map((l) => ({ value: l, label: t(`strength.legLoad.${l}`) }))}
        selected={[legLoad]}
        onToggle={setLegLoad}
      />
      <Text variant="caption" tone="secondary">
        {t('strength.custom.legLoadHint')}
      </Text>
      <CheckRow label={t('gym.edit.unilateral')} checked={unilateral} onChange={setUnilateral} />
      <TextField
        label={t('gym.edit.instructions')}
        value={instructions}
        onChangeText={setInstructions}
        multiline
      />
      <TextField
        label={t('gym.edit.cues')}
        hint={t('gym.edit.onePerLine')}
        value={cues}
        onChangeText={setCues}
        multiline
      />
      <TextField
        label={t('gym.edit.mistakes')}
        hint={t('gym.edit.onePerLine')}
        value={mistakes}
        onChangeText={setMistakes}
        multiline
      />
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            label={t('strength.custom.save')}
            onPress={() => {
              setSubmitted(true);
              if (result.ok) onSave(result.value);
            }}
          />
        </View>
        <View style={styles.flex}>
          <Button variant="secondary" label={t('common.cancel')} onPress={onCancel} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
