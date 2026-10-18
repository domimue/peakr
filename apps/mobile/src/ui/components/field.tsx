import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, typography, useTheme } from '../theme';
import { Text } from './text';

export interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Label, input slot and hint / error line shared by all form fields. */
export function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.shell}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text variant="caption" style={{ color: colors.danger }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface InputProps extends TextInputProps {
  suffix?: string;
  invalid?: boolean;
}

export function Input({ suffix, invalid, style, ...rest }: InputProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.inputRow,
        {
          backgroundColor: colors.surface,
          borderColor: invalid ? colors.danger : colors.border,
        },
      ]}
    >
      <TextInput
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, typography.body, { color: colors.text }, style]}
        {...rest}
      />
      {suffix ? (
        <Text tone="secondary" style={styles.suffix}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

export interface TextFieldProps extends Omit<InputProps, 'invalid'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, ...inputProps }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <Input accessibilityLabel={label} invalid={Boolean(error)} {...inputProps} />
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  shell: { gap: spacing.xs },
  label: { fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 48,
  },
  input: { flex: 1, paddingVertical: spacing.sm },
  suffix: { marginLeft: spacing.xs },
});
