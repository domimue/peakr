import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '../theme';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ListStateProps =
  | { kind: 'loading'; label: string }
  | { kind: 'error'; title: string; message?: string; retryLabel?: string; onRetry?: () => void }
  | {
      kind: 'empty';
      title: string;
      message?: string;
      icon?: IconName;
      actionLabel?: string;
      onAction?: () => void;
    };

/** Loading, empty and error state of a list – every list shows one of these instead of nothing. */
export function ListState(props: ListStateProps) {
  const { colors } = useTheme();
  if (props.kind === 'loading') {
    return (
      <View style={styles.box} accessible accessibilityLabel={props.label} testID="list-loading">
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  const error = props.kind === 'error';
  const action = error
    ? { label: props.retryLabel, onPress: props.onRetry }
    : { label: props.actionLabel, onPress: props.onAction };
  return (
    <View style={styles.box} testID={error ? 'list-error' : 'list-empty'}>
      <Icon
        name={error ? 'error' : (props.icon ?? 'info')}
        size={28}
        color={error ? colors.errorText : colors.textMuted}
      />
      <Text variant="label" style={styles.center}>
        {props.title}
      </Text>
      {props.message ? (
        <Text tone="secondary" style={styles.center}>
          {props.message}
        </Text>
      ) : null}
      {action.label && action.onPress ? (
        <Button small variant="secondary" label={action.label} onPress={action.onPress} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  center: { textAlign: 'center' },
});
