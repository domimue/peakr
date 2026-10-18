import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, useTheme } from '../theme';
import { Text } from './text';

export interface ScreenProps {
  /** Large in-content title. Omit on screens that have a navigation header. */
  title?: string;
  /** Content above the title, e.g. the logo on the onboarding intro. */
  header?: ReactNode;
  children?: ReactNode;
}

export function Screen({ title, header, children }: ScreenProps) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      // With a navigation header the header already handles the top inset.
      edges={title || header ? ['top'] : []}
      style={[styles.root, { backgroundColor: colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
      >
        {header}
        {title ? (
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});
