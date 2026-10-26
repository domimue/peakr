import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { spacing, Text } from '@/ui';

/** What the Body add-on contains – the same list on every paywall that sells it. */
export const BODY_FEATURES = ['diary', 'energy', 'goal', 'checkIn', 'dashboard', 'coach'] as const;

export function BodyFeatureList() {
  const { t } = useTranslation();
  return (
    <View style={styles.list} testID="body-features">
      {BODY_FEATURES.map((f) => (
        <Text key={f} variant="caption">{`✓  ${t(`bodyAddon.features.${f}`)}`}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
});
