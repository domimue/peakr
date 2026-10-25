import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import {
  askNotificationPermission,
  notificationPermission,
  type PermissionState,
} from '@/features/notifications/permission';
import { setActivityAlerts, usePushStore } from '@/features/notifications/push';
import { useReminderSettings, useSaveReminderSettings } from '@/features/notifications/queries';
import {
  clockText,
  REMINDER_STEP_MIN,
  type ReminderSettings,
} from '@/features/notifications/reminder-settings';
import { useWeatherSettings } from '@/features/weather/queries';
import { Button, Screen, SegmentedControl, spacing, Stepper, Text, useTheme } from '@/ui';

type OnOff = 'on' | 'off';

/**
 * Profile → Notifications: the daily workout reminder (on/off, time, weather line) and the
 * optional "activity synced" notification. One push per day at most, only on workout days.
 */
export function NotificationsScreen() {
  const { data: settings } = useReminderSettings();
  if (!settings) return <Screen />;
  return <NotificationsForm settings={settings} />;
}

function NotificationsForm({ settings }: { settings: ReminderSettings }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const save = useSaveReminderSettings();
  const userId = useSessionStore(selectAccountUserId);
  const { data: weather } = useWeatherSettings();
  const pushToken = usePushStore((s) => s.token);
  const activityAlerts = usePushStore((s) => s.activityAlerts);
  const [permission, setPermission] = useState<PermissionState | null>(null);

  useEffect(() => {
    void notificationPermission().then(setPermission);
  }, []);

  const update = (patch: Partial<ReminderSettings>) => save.mutate({ ...settings, ...patch });

  const setEnabled = async (enabled: boolean) => {
    update({ enabled });
    if (enabled) {
      await askNotificationPermission();
      setPermission(await notificationPermission());
    }
  };

  const onOff = (on: boolean): OnOff => (on ? 'on' : 'off');
  const options = [
    { value: 'on' as const, label: t('notifications.on') },
    { value: 'off' as const, label: t('notifications.off') },
  ];

  return (
    <Screen>
      <Text tone="secondary">{t('notifications.intro')}</Text>
      {!userId ? (
        <Text style={{ color: colors.warningText }}>{t('notifications.signedOut')}</Text>
      ) : null}
      {permission === 'denied' ? (
        <View style={styles.group}>
          <Text style={{ color: colors.warningText }}>{t('notifications.denied')}</Text>
          <Button
            small
            variant="secondary"
            label={t('notifications.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}

      <View style={styles.group}>
        <Text variant="label">{t('notifications.reminder.label')}</Text>
        <SegmentedControl
          options={options}
          value={onOff(settings.enabled)}
          onChange={(v) => void setEnabled(v === 'on')}
        />
        <Text variant="caption" tone="secondary">
          {t('notifications.reminder.hint')}
        </Text>
      </View>

      {settings.enabled ? (
        <>
          <Stepper
            label={t('notifications.reminder.time')}
            value={settings.minute}
            min={0}
            max={24 * 60 - REMINDER_STEP_MIN}
            step={REMINDER_STEP_MIN}
            onChange={(minute) => update({ minute })}
            format={(m) => clockText(m, i18n.language)}
            decreaseLabel={t('notifications.reminder.earlier')}
            increaseLabel={t('notifications.reminder.later')}
          />
          <View style={styles.group}>
            <Text variant="label">{t('notifications.reminder.weather')}</Text>
            <SegmentedControl
              options={options}
              value={onOff(settings.weather)}
              onChange={(v) => update({ weather: v === 'on' })}
            />
            <Text variant="caption" tone="secondary">
              {weather?.enabled
                ? t('notifications.reminder.weatherHint')
                : t('notifications.reminder.weatherOff')}
            </Text>
            {!weather?.enabled ? (
              <Button
                small
                variant="secondary"
                icon="weather"
                label={t('weather.settings.title')}
                onPress={() => router.push('/training/weather')}
              />
            ) : null}
          </View>
        </>
      ) : null}

      {pushToken ? (
        <View style={styles.group}>
          <Text variant="label">{t('notifications.activity.label')}</Text>
          <SegmentedControl
            options={options}
            value={onOff(activityAlerts)}
            onChange={(v) => void setActivityAlerts(v === 'on')}
          />
          <Text variant="caption" tone="secondary">
            {t('notifications.activity.hint')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
