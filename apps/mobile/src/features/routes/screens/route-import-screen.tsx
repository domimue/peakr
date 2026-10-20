import type { RouteSport } from '@peakr/engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, ChipGroup, ListState, Screen, spacing, Text, TextField, useTheme } from '@/ui';

import { ElevationChart } from '../components/elevation-chart';
import { RouteMap } from '../components/route-map';
import { draftFromGpx, nameFromUri, pickGpxFile, readFileText, type RouteDraft } from '../import';
import { useSaveRoute } from '../queries';
import { routeColor, routeFacts } from './route-library-screen';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; draft: RouteDraft };

/**
 * GPX import: from the document picker, or from a file shared / opened with Peakr (`uri`
 * parameter). Shows the route before it is saved; the user names it and picks run or ride.
 */
export function RouteImportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ uri?: string }>();
  const save = useSaveRoute();
  const [picked, setPicked] = useState<State | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [sportDraft, setSportDraft] = useState<RouteSport | null>(null);

  async function load(uri: string, fileName: string): Promise<State> {
    try {
      const xml = await readFileText(uri);
      const result = draftFromGpx(xml, fileName || t('routes.import.defaultName'));
      if (!result.ok) {
        const code = result.issues[0]?.code ?? 'gpxNoPoints';
        return { kind: 'error', message: t(`validation.${code}`) };
      }
      return { kind: 'ready', draft: result.value };
    } catch (error) {
      console.warn('GPX import failed', error);
      return { kind: 'error', message: t('routes.import.readError') };
    }
  }

  // A file shared with / opened in Peakr.
  const shared = useQuery({
    queryKey: ['routes', 'gpx-import', params.uri],
    queryFn: () => load(params.uri as string, nameFromUri(params.uri as string)),
    enabled: params.uri !== undefined,
    staleTime: Infinity,
  });

  async function onPick() {
    const file = await pickGpxFile();
    if (!file) return;
    setPicked({ kind: 'loading' });
    setNameDraft(null);
    setSportDraft(null);
    setPicked(await load(file.uri, nameFromUri(file.name)));
  }

  const state: State =
    picked ?? (params.uri === undefined ? { kind: 'idle' } : (shared.data ?? { kind: 'loading' }));
  const name = nameDraft ?? (state.kind === 'ready' ? state.draft.name : '');
  const sport = sportDraft ?? (state.kind === 'ready' ? state.draft.sport : 'run');
  const trimmed = name.trim();

  return (
    <Screen>
      <Text tone="secondary">{t('routes.import.intro')}</Text>
      <Button
        variant={state.kind === 'ready' ? 'secondary' : 'primary'}
        label={state.kind === 'ready' ? t('routes.import.another') : t('routes.import.pick')}
        icon="plus"
        onPress={() => void onPick()}
      />
      {state.kind === 'loading' ? <ListState kind="loading" label={t('common.loading')} /> : null}
      {state.kind === 'error' ? (
        <Text tone="danger" accessibilityRole="alert" testID="import-error">
          {state.message}
        </Text>
      ) : null}
      {state.kind === 'ready' ? (
        <View style={styles.gap} testID="import-preview">
          <RouteMap polyline={state.draft.polyline} color={routeColor(colors, sport)} />
          <Text variant="caption" tone="secondary">
            {routeFacts(t, state.draft)}
          </Text>
          <ElevationChart
            profile={state.draft.profile}
            color={routeColor(colors, sport)}
            gainM={state.draft.gainM}
            lossM={state.draft.lossM}
          />
          <TextField
            label={t('routes.name')}
            value={name}
            onChangeText={setNameDraft}
            maxLength={200}
            error={trimmed === '' ? t('validation.required') : undefined}
          />
          <ChipGroup
            label={t('routes.filter.sport')}
            options={[
              { value: 'run', label: t('routes.sport.run') },
              { value: 'bike', label: t('routes.sport.bike') },
            ]}
            selected={[sport]}
            onToggle={setSportDraft}
          />
          <Button
            label={t('routes.import.save')}
            disabled={trimmed === '' || save.isPending}
            onPress={() =>
              save.mutate(
                { ...state.draft, name: trimmed, sport },
                { onSuccess: (r) => router.replace(`/routes/${encodeURIComponent(r.id)}`) },
              )
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
});
