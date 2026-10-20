import { isCustomExercise, type CustomExercise, type Exercise } from '@peakr/engine';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { IconBadge, radius, useTheme } from '@/ui';

import { PATTERN_ICONS } from '../exercise-text';
import { FIGURES } from './poses';
import { figureSvg } from './render';
import type { FigureDef } from './render';

/** The figure of a library exercise, or of the library exercise a custom copy is based on. */
export function figureOf(exercise: Exercise | CustomExercise): FigureDef | undefined {
  const id = isCustomExercise(exercise) ? exercise.basedOn : exercise.id;
  return id ? FIGURES[id] : undefined;
}

/**
 * Exercise illustration: the start position faint, the working position solid (decorative – the
 * name and instructions carry the meaning). Exercises without a figure show their pattern icon.
 */
export function ExerciseFigure({
  exercise,
  size,
}: {
  exercise: Exercise | CustomExercise;
  size: number;
}) {
  const { colors } = useTheme();
  const def = figureOf(exercise);
  const xml = useMemo(
    () => (def ? figureSvg(def, { body: colors.text, equipment: colors.textMuted }) : null),
    [def, colors.text, colors.textMuted],
  );
  if (!xml) {
    return (
      <IconBadge name={PATTERN_ICONS[exercise.pattern]} color={colors.typeStrength} size={size} />
    );
  }
  return (
    <View
      style={[styles.box, { width: size, height: size, backgroundColor: colors.surface2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`figure-${exercise.id}`}
    >
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, overflow: 'hidden' },
});
