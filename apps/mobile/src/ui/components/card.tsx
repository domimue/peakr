import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { radius, spacing, useTheme } from '../theme';

export interface CardProps extends ViewProps {
  children?: ReactNode;
}

export function Card({ style, children, ...rest }: CardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
});
