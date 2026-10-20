import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import * as repo from '@/data/repositories/route-repository';
import { Button, Card, Icon, spacing, Text, TextField, useTheme } from '@/ui';

import { komootClient, normalizeKomootProfileUrl } from '../komoot';

const KEY = ['komoot', 'profileUrl'] as const;

/**
 * Komoot, phase 1 (CLAUDE.md "Integrations"): the user's profile URL is stored, tours come in as
 * GPX files. Direct import needs Komoot's partner API and stays "coming soon" until then.
 */
export function KomootCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const client = useQueryClient();
  const { data: saved } = useQuery({ queryKey: KEY, queryFn: repo.getKomootProfileUrl });
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (url: string | null) => repo.saveKomootProfileUrl(url),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
  const value = draft ?? saved ?? '';

  function onSave() {
    if (value.trim() === '') {
      save.mutate(null, { onSuccess: () => setDraft(null) });
      setError(null);
      return;
    }
    const url = normalizeKomootProfileUrl(value);
    if (!url) {
      setError(t('connections.komoot.invalid'));
      return;
    }
    setError(null);
    save.mutate(url, { onSuccess: () => setDraft(null) });
  }

  return (
    <Card testID="komoot-card">
      <View style={styles.row}>
        <Icon name="route" size={22} color={colors.text} />
        <Text variant="subtitle" style={styles.flex}>
          Komoot
        </Text>
        {!komootClient().available ? (
          <Text variant="caption" tone="secondary">
            {t('connections.komoot.apiSoon')}
          </Text>
        ) : null}
      </View>
      <Text tone="secondary">{t('connections.komoot.hint')}</Text>
      <TextField
        label={t('connections.komoot.profileUrl')}
        value={value}
        onChangeText={setDraft}
        placeholder="https://www.komoot.com/user/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={error ?? undefined}
      />
      <Button
        variant="secondary"
        small
        label={t('common.save')}
        disabled={draft === null || save.isPending}
        onPress={onSave}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
