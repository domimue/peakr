import {
  copyInputOf,
  getExercise,
  isCustomExercise,
  resolveExercise,
  type CustomExercise,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { newId } from '@/data/ids';
import { Button, Card, IconBadge, Screen, spacing, Text, useTheme } from '@/ui';

import { ExerciseForm } from '../exercise-form';
import { ExerciseBrowser } from '../exercise-picker';
import { exerciseTexts, PATTERN_ICONS } from '../exercise-text';
import { useDeleteGymExercise, useGymExercises, useSaveGymExercise } from '../queries';

/** Gym → Library: every library and custom exercise, searchable and filterable. */
export function LibraryScreen() {
  const { t } = useTranslation();
  const custom = useGymExercises();
  return (
    <Screen>
      <Text tone="secondary">{t('gym.library.intro')}</Text>
      <Button
        variant="secondary"
        icon="plus"
        label={t('strength.picker.createCustom')}
        onPress={() => router.push('/gym/exercise/edit')}
      />
      <ExerciseBrowser
        custom={custom.data ?? []}
        onOpen={(id) => router.push({ pathname: '/gym/exercise/[id]', params: { id } })}
      />
    </Screen>
  );
}

/** One exercise: movement, muscles, equipment, instructions, cues and common mistakes. */
export function ExerciseDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const custom = useGymExercises();
  const remove = useDeleteGymExercise();
  if (custom.isPending) return <Screen />;
  const exercise = resolveExercise(id, custom.data ?? []);
  if (!exercise) {
    return (
      <Screen>
        <Text tone="secondary">{t('gym.exercise.notFound')}</Text>
      </Screen>
    );
  }
  const texts = exerciseTexts(t, exercise);
  const own = isCustomExercise(exercise);
  const muscles = (list: readonly string[]) =>
    list.map((m) => t(`gym.muscles.${m}` as never)).join(', ');
  return (
    <Screen>
      <View style={styles.head}>
        {/* Slot for a real illustration (docs/gym-illustrations.md); the pattern icon until then. */}
        <IconBadge name={PATTERN_ICONS[exercise.pattern]} color={colors.typeStrength} size={56} />
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header">
            {texts.name}
          </Text>
          <Text variant="caption" tone="secondary">
            {[
              t(`strength.patterns.${exercise.pattern}`),
              own ? t('gym.library.custom') : null,
              exercise.unilateral ? t('gym.exercise.unilateral') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
      <Card style={styles.card}>
        <Fact label={t('gym.exercise.primary')} value={muscles(exercise.primaryMuscles) || '–'} />
        {exercise.secondaryMuscles.length > 0 ? (
          <Fact label={t('gym.exercise.secondary')} value={muscles(exercise.secondaryMuscles)} />
        ) : null}
        <Fact
          label={t('strength.custom.equipment')}
          value={exercise.equipment.map((e) => t(`strength.equipment.${e}`)).join(', ')}
        />
        <Fact label={t('gym.edit.tracking')} value={t(`gym.tracking.${exercise.trackingMode}`)} />
        <Fact
          label={t('strength.custom.legLoad')}
          value={t(`strength.legLoad.${exercise.legLoad}`)}
        />
        {texts.aliases.length > 0 ? (
          <Fact label={t('gym.edit.aliases')} value={texts.aliases.join(', ')} />
        ) : null}
      </Card>
      {texts.instructions ? (
        <Card style={styles.card}>
          <Text variant="heading">{t('gym.edit.instructions')}</Text>
          <Text>{texts.instructions}</Text>
        </Card>
      ) : null}
      <Bullets title={t('gym.edit.cues')} items={texts.cues} />
      <Bullets title={t('gym.edit.mistakes')} items={texts.mistakes} />
      {own ? (
        <>
          <Button
            icon="edit"
            label={t('gym.exercise.edit')}
            onPress={() => router.push({ pathname: '/gym/exercise/edit', params: { id } })}
          />
          <Button
            variant="danger"
            icon="trash"
            label={t('gym.exercise.delete')}
            onPress={() => remove.mutate(id, { onSuccess: () => router.back() })}
          />
        </>
      ) : (
        <Button
          icon="copy"
          label={t('gym.exercise.editCopy')}
          onPress={() => router.push({ pathname: '/gym/exercise/edit', params: { copyOf: id } })}
        />
      )}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

function Bullets({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Text variant="heading">{title}</Text>
      {items.map((item, i) => (
        <Text key={i}>{`• ${item}`}</Text>
      ))}
    </Card>
  );
}

/** New custom exercise, edit a custom one (`id`), or an editable copy of a library one (`copyOf`). */
export function ExerciseEditScreen({ id, copyOf }: { id?: string; copyOf?: string }) {
  const { t } = useTranslation();
  const custom = useGymExercises();
  const save = useSaveGymExercise();
  if (custom.isPending) return <Screen />;
  const done = (exercise: CustomExercise) =>
    save.mutate(exercise, {
      onSuccess: () =>
        router.replace({ pathname: '/gym/exercise/[id]', params: { id: exercise.id } }),
    });

  let initial;
  let title = t('strength.custom.title');
  const own = id ? custom.data?.find((e) => e.id === id) : undefined;
  const library = copyOf ? getExercise(copyOf) : undefined;
  if (own) {
    initial = { ...own, id: own.id };
    title = t('gym.exercise.edit');
  } else if (library) {
    const texts = exerciseTexts(t, library);
    initial = copyInputOf(
      library,
      {
        name: t('gym.exercise.copyName', { name: texts.name }),
        aliases: texts.aliases,
        ...(texts.instructions ? { instructions: texts.instructions } : {}),
        cues: texts.cues,
        mistakes: texts.mistakes,
      },
      newId(),
    );
    title = t('gym.exercise.editCopy');
  }
  return (
    <Screen>
      {library ? <Text tone="secondary">{t('gym.exercise.copyIntro')}</Text> : null}
      <ExerciseForm initial={initial} title={title} onSave={done} onCancel={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  card: { gap: spacing.sm },
  fact: { gap: 2 },
});
