import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, spacing, Text, TextField, useTheme } from '@/ui';

import { useHomeStart, useSaveHomeStart } from '../queries';
import { formatLatLon, parseLatLon } from '../start-point';

/**
 * Home start point: route options are ranked by how close they start to it. Stored on this
 * device only.
 */
export function HomeStartCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: saved } = useHomeStart();
  const save = useSaveHomeStart();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? (saved ? formatLatLon(saved) : '');

  function onSave() {
    const start = parseLatLon(value);
    if (!start) {
      setError(t('routes.start.invalid'));
      return;
    }
    setError(null);
    save.mutate(start, { onSuccess: () => setDraft(null) });
  }

  function onClear() {
    setError(null);
    save.mutate(null, { onSuccess: () => setDraft(null) });
  }

  return (
    <Card testID="home-start-card">
      <View style={styles.row}>
        <Icon name="route" size={22} color={colors.text} />
        <Text variant="subtitle" style={styles.flex}>
          {t('routes.start.title')}
        </Text>
      </View>
      <Text tone="secondary">{t('routes.start.hint')}</Text>
      <TextField
        label={t('routes.start.coordinates')}
        value={value}
        onChangeText={setDraft}
        placeholder="47.37690, 8.54170"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        error={error ?? undefined}
      />
      <View style={styles.row}>
        <Button
          variant="secondary"
          small
          label={t('common.save')}
          disabled={draft === null || save.isPending}
          onPress={onSave}
        />
        {saved ? (
          <Button
            variant="secondary"
            small
            label={t('routes.start.clear')}
            disabled={save.isPending}
            onPress={onClear}
          />
        ) : null}
      </View>
      <Text variant="caption" tone="secondary">
        {t('routes.start.privacy')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
