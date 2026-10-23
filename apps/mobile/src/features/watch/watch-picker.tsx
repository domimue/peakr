import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { ChoiceList, Text } from '@/ui';

import { optionState, WATCH_CHOICES, type WatchChoice } from './options';

export interface WatchPickerProps {
  value: WatchChoice | null | undefined;
  onChange: (choice: WatchChoice) => void;
  /** Platform the picker is shown on; the device's by default. */
  os?: 'android' | 'ios';
}

/**
 * Garmin, COROS, Suunto, Apple Watch ("with the iPhone app") and Other (file export). A brand whose
 * direct sync is not switched on yet says so and offers the file export meanwhile.
 */
export function WatchPicker({ value, onChange, os = Platform.OS === 'ios' ? 'ios' : 'android' }: WatchPickerProps) {
  const { t } = useTranslation();
  const choices = WATCH_CHOICES.map((choice) => {
    const state = optionState(choice, os);
    const hint =
      choice === 'none'
        ? undefined
        : state === 'iosOnly'
          ? t('watch.iosOnly')
          : state === 'fileForNow'
            ? `${t(`watch.hints.${choice}` as never) as string} ${t('watch.soon')}`
            : (t(`watch.hints.${choice}` as never) as string);
    return {
      value: choice,
      label: choice === 'none' ? t('watch.none') : t(`watch.options.${choice}` as never),
      ...(hint ? { description: hint } : {}),
    };
  });
  return (
    <>
      <ChoiceList label={t('watch.title')} choices={choices} value={value ?? undefined} onChange={onChange} />
      {value === 'apple' && os === 'android' ? (
        <Text variant="caption" tone="secondary">
          {t('watch.iosOnly')}
        </Text>
      ) : null}
    </>
  );
}
