import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { buttonTokens, fontSizes, radius, spacing, useTheme } from '../theme';
import { Text } from './text';

export interface KeypadStep {
  /** Added to the current value (negative to subtract). */
  delta: number;
  label: string;
}

export interface NumericKeypadProps {
  visible: boolean;
  /** What is being entered, read out and shown above the value ("Weight · Bench press · Set 2"). */
  title: string;
  /** The text entered so far ("" = empty, the placeholder shows). */
  value: string;
  placeholder?: string;
  unit?: string;
  allowDecimal?: boolean;
  /** Quick steps, e.g. −2.5 / +2.5 kg. */
  steps?: readonly KeypadStep[];
  onChange: (value: string) => void;
  /** Primary key: on to the next field. */
  nextLabel: string;
  onNext: () => void;
  /** Optional second action key (e.g. "Complete set"). */
  doneLabel?: string;
  onDone?: () => void;
  onClose: () => void;
  closeLabel: string;
  deleteLabel: string;
}

const KEY_HEIGHT = 64;
const MAX_LENGTH = 7;

/** Appends a key to the entered text: one decimal separator, at most two decimals. */
export function keypadInput(value: string, key: string, allowDecimal: boolean): string {
  if (key === 'del') return value.slice(0, -1);
  if (key === '.') {
    if (!allowDecimal || value.includes('.')) return value;
    return value === '' ? '0.' : `${value}.`;
  }
  if (value.length >= MAX_LENGTH) return value;
  const decimals = value.split('.')[1];
  if (decimals !== undefined && decimals.length >= 2) return value;
  if (value === '0') return key;
  return value + key;
}

/** The entered text with a step applied (never below 0), trimmed to two decimals. */
export function keypadStep(value: string, placeholder: string | undefined, delta: number): string {
  const base = Number(value || placeholder || '0');
  const next = Math.max(0, Math.round(((Number.isFinite(base) ? base : 0) + delta) * 100) / 100);
  return String(next);
}

/**
 * A big numeric keypad as a bottom sheet (CLAUDE.md "Gym": fast set input, used standing between
 * sets). Keys are 64 pt high; the system keyboard never opens. Haptic tick on every key.
 */
export function NumericKeypad({
  visible,
  title,
  value,
  placeholder,
  unit,
  allowDecimal = false,
  steps = [],
  onChange,
  nextLabel,
  onNext,
  doneLabel,
  onDone,
  onClose,
  closeLabel,
  deleteLabel,
}: NumericKeypadProps) {
  const { colors } = useTheme();
  const press = (key: string) => {
    void Haptics.selectionAsync();
    onChange(keypadInput(value, key, allowDecimal));
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', allowDecimal ? '.' : '', '0', 'del'];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
      />
      <SafeAreaView
        edges={['bottom']}
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.head}>
          <Text variant="caption" tone="secondary" style={styles.flex} numberOfLines={1}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Text style={{ color: colors.accentLine }}>{closeLabel}</Text>
          </Pressable>
        </View>
        <View
          style={[styles.display, { borderColor: colors.border, backgroundColor: colors.bg }]}
          accessible
          accessibilityLabel={`${title}: ${value || placeholder || ''} ${unit ?? ''}`}
          accessibilityLiveRegion="polite"
          testID="keypad-value"
        >
          <Text
            style={[styles.value, { color: value ? colors.text : colors.textMuted }]}
            numberOfLines={1}
          >
            {value || placeholder || '–'}
          </Text>
          {unit ? (
            <Text variant="label" tone="secondary">
              {unit}
            </Text>
          ) : null}
        </View>
        {steps.length > 0 ? (
          <View style={styles.row}>
            {steps.map((s) => (
              <Key
                key={s.label}
                label={s.label}
                small
                wide
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChange(keypadStep(value, placeholder, s.delta));
                }}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.grid}>
          {keys.map((k, i) =>
            k === '' ? (
              <View key={`blank-${i}`} style={styles.key} />
            ) : (
              <Key
                key={k}
                label={k === 'del' ? '⌫' : k}
                accessibilityLabel={k === 'del' ? deleteLabel : k}
                onPress={() => press(k)}
              />
            ),
          )}
        </View>
        <View style={styles.row}>
          {doneLabel && onDone ? <Key label={doneLabel} onPress={onDone} wide /> : null}
          <Key label={nextLabel} onPress={onNext} primary wide />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Key({
  label,
  accessibilityLabel,
  onPress,
  primary,
  small,
  wide,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  primary?: boolean;
  small?: boolean;
  wide?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        small && styles.smallKey,
        wide && styles.wide,
        {
          backgroundColor: primary
            ? pressed
              ? colors.accentPressed
              : colors.accent
            : pressed
              ? colors.border
              : colors.surface2,
        },
      ]}
    >
      <Text
        variant={small || wide ? 'label' : 'subtitle'}
        style={{ color: primary ? colors.onAccent : colors.text }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  display: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  value: { fontSize: fontSizes.xxl, lineHeight: 40, fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  key: {
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: KEY_HEIGHT,
    borderRadius: buttonTokens.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallKey: { minHeight: buttonTokens.minHeight },
  wide: { flexBasis: 0 },
});
