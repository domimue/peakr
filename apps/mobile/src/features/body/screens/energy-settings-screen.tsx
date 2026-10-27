import { energyConfig } from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, ChoiceList, ListState, Screen, Slider, Text } from '@/ui';

import { EVERYDAY_ACTIVITIES, type EnergySettings } from '../energy-settings';
import { useEnergySettings, useSaveEnergySettings } from '../queries';

/**
 * Body → Energy targets: the everyday activity outside sport, and protein and fat per kg. The
 * carbohydrates are whatever energy remains (engine `macroTargets`), so they are not set here.
 */
export function EnergySettingsScreen() {
  const { t } = useTranslation();
  const { data } = useEnergySettings();
  const save = useSaveEnergySettings();
  const [draft, setDraft] = useState<EnergySettings | null>(null);
  const [saved, setSaved] = useState(false);
  if (!data) return <ListState kind="loading" label={t('common.loading')} />;
  const s = draft ?? data;
  const m = energyConfig.macros;
  const set = (patch: Partial<EnergySettings>) => {
    setSaved(false);
    setDraft({ ...s, ...patch });
  };
  return (
    <Screen>
      <Text tone="secondary">{t('bodyAddon.energy.intro')}</Text>
      <Text variant="heading">{t('bodyAddon.energy.everydayTitle')}</Text>
      <Text tone="secondary">{t('bodyAddon.energy.everydayHint')}</Text>
      <ChoiceList
        label={t('bodyAddon.energy.everydayTitle')}
        choices={EVERYDAY_ACTIVITIES.map((a) => ({
          value: a,
          label: t(`bodyAddon.energy.everyday.${a}.label`),
          description: t(`bodyAddon.energy.everyday.${a}.description`),
        }))}
        value={s.everydayActivity ?? undefined}
        onChange={(a) => set({ everydayActivity: a })}
      />
      <Slider
        testID="energy-protein"
        label={t('bodyAddon.energy.protein', { value: s.proteinGPerKg })}
        value={s.proteinGPerKg}
        min={m.proteinGPerKg.min}
        max={m.proteinGPerKg.max}
        step={0.1}
        onChange={(v) => set({ proteinGPerKg: Math.round(v * 10) / 10 })}
        format={(v) => t('bodyAddon.energy.protein', { value: v })}
      />
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.energy.proteinHint')}
      </Text>
      <Slider
        testID="energy-fat"
        label={t('bodyAddon.energy.fat', { value: s.fatGPerKg })}
        value={s.fatGPerKg}
        min={m.fatGPerKg.min}
        max={m.fatGPerKg.max}
        step={0.1}
        onChange={(v) => set({ fatGPerKg: Math.round(v * 10) / 10 })}
        format={(v) => t('bodyAddon.energy.fat', { value: v })}
      />
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.energy.fatHint')}
      </Text>
      <Button
        label={t('bodyAddon.energy.save')}
        disabled={draft === null || save.isPending}
        onPress={() => save.mutate(s, { onSuccess: () => setSaved(true) })}
        testID="energy-save"
      />
      {saved ? (
        <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
          {t('bodyAddon.energy.saved')}
        </Text>
      ) : null}
    </Screen>
  );
}
