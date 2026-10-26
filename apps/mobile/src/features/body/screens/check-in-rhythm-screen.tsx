import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Card, ChipGroup, ListState, Screen, SegmentedControl, spacing, Text } from '@/ui';

import type { CheckInSettings } from '../check-in-settings';
import { useCheckInSettings, useSaveCheckInSettings } from '../queries';

/** 2026-10-25 is a Sunday: day `n` of the week is 25 + n, for the weekday names. */
const weekdayName = (weekday: number, language: string) =>
  new Date(Date.UTC(2026, 9, 25 + weekday, 12)).toLocaleDateString(language, {
    weekday: 'long',
    timeZone: 'UTC',
  });

/** Monday first, Sunday last. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Body → Check-in → Rhythm & reminder: weigh daily or weekly, the measuring day, the reminder. */
export function CheckInRhythmScreen() {
  const { t, i18n } = useTranslation();
  const settings = useCheckInSettings();
  const save = useSaveCheckInSettings();
  if (!settings.data) return <ListState kind="loading" label={t('common.loading')} />;
  const s = settings.data;
  const update = (patch: Partial<CheckInSettings>) => save.mutate({ ...s, ...patch });

  return (
    <Screen>
      <Card style={styles.stack}>
        <Text variant="label">{t('bodyAddon.checkIn.settings.weigh')}</Text>
        <SegmentedControl
          options={[
            { value: 'daily', label: t('bodyAddon.checkIn.settings.weighDaily') },
            { value: 'weekly', label: t('bodyAddon.checkIn.settings.weighWeekly') },
          ]}
          value={s.weighDaily ? 'daily' : 'weekly'}
          onChange={(v) => update({ weighDaily: v === 'daily' })}
        />
        <ChipGroup
          label={t('bodyAddon.checkIn.settings.measureDay')}
          options={WEEK.map((d) => ({ value: String(d), label: weekdayName(d, i18n.language) }))}
          selected={[String(s.measureWeekday)]}
          onToggle={(v) => update({ measureWeekday: Number(v) })}
        />
        <Text variant="label">{t('bodyAddon.checkIn.settings.reminder')}</Text>
        <SegmentedControl
          options={[
            { value: 'on', label: t('bodyAddon.checkIn.settings.on') },
            { value: 'off', label: t('bodyAddon.checkIn.settings.off') },
          ]}
          value={s.reminder ? 'on' : 'off'}
          onChange={(v) => update({ reminder: v === 'on' })}
        />
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.checkIn.settings.reminderHint')}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
});
