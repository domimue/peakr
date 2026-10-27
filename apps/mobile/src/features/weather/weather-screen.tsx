import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, SegmentedControl, spacing, Stepper, Text, useTheme } from '@/ui';

import { useHomeStart } from '../routes/queries';
import { formatLatLon } from '../routes/start-point';
import { askLocationPermission } from './location';
import { useSaveWeatherSettings, useWeatherSettings } from './queries';
import type { WeatherSettings } from './settings';

type OnOff = 'on' | 'off';

const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/**
 * Profile → Weather check: on/off, which location, the usual training time (the plan has no time
 * of day). Weather hints go into the daily reminder (Settings → Notifications). The location
 * permission is asked only when the check is turned on with "current location"; without it the
 * home start point is used.
 */
export function WeatherScreen() {
  const { data: settings } = useWeatherSettings();
  if (!settings) return <Screen />;
  return <WeatherForm settings={settings} />;
}

function WeatherForm({ settings }: { settings: WeatherSettings }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const save = useSaveWeatherSettings();
  const { data: home } = useHomeStart();
  const [notice, setNotice] = useState<string | null>(null);

  const update = (patch: Partial<WeatherSettings>) => save.mutate({ ...settings, ...patch });

  const setEnabled = async (enabled: boolean) => {
    setNotice(null);
    if (enabled && settings.source === 'current' && !(await askLocationPermission())) {
      setNotice(t('weather.settings.permissionDenied'));
      update({ enabled, source: 'home' });
      return;
    }
    update({ enabled });
  };

  const setSource = async (source: WeatherSettings['source']) => {
    setNotice(null);
    if (source === 'current' && !(await askLocationPermission())) {
      setNotice(t('weather.settings.permissionDenied'));
      return;
    }
    update({ source });
  };

  const onOff = (on: boolean): OnOff => (on ? 'on' : 'off');
  const onOffOptions = [
    { value: 'on' as const, label: t('weather.settings.on') },
    { value: 'off' as const, label: t('weather.settings.off') },
  ];

  return (
    <Screen>
      <Text tone="secondary">{t('weather.settings.intro')}</Text>
      <View style={styles.group}>
        <Text variant="label">{t('weather.settings.enabled')}</Text>
        <SegmentedControl
          options={onOffOptions}
          value={onOff(settings.enabled)}
          onChange={(v) => void setEnabled(v === 'on')}
        />
      </View>

      {notice ? <Text style={{ color: colors.warningText }}>{notice}</Text> : null}

      {settings.enabled ? (
        <>
          <View style={styles.group}>
            <Text variant="label">{t('weather.settings.location')}</Text>
            <SegmentedControl
              options={[
                { value: 'current' as const, label: t('weather.settings.current') },
                { value: 'home' as const, label: t('weather.settings.home') },
              ]}
              value={settings.source}
              onChange={(v) => void setSource(v)}
            />
            <Text variant="caption" tone="secondary">
              {home
                ? t('weather.settings.homeIs', { point: formatLatLon(home) })
                : t('weather.settings.noHome')}
            </Text>
            {!home ? (
              <Button
                small
                variant="secondary"
                icon="location"
                label={t('weather.settings.setHome')}
                onPress={() => router.push('/training/terrain')}
              />
            ) : null}
          </View>

          <Stepper
            label={t('weather.settings.sessionHour')}
            value={settings.sessionHour}
            min={5}
            max={22}
            onChange={(sessionHour) => update({ sessionHour })}
            format={clock}
            decreaseLabel={t('weather.settings.earlier')}
            increaseLabel={t('weather.settings.later')}
          />
          <Text variant="caption" tone="secondary">
            {t('weather.settings.sessionHourHint')}
          </Text>

          <Button
            small
            variant="secondary"
            icon="bell"
            label={t('weather.settings.reminderLink')}
            onPress={() => router.push('/settings/notifications')}
          />
        </>
      ) : null}

      <Card>
        <Text variant="caption" tone="secondary">
          {t('weather.settings.attribution')}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
