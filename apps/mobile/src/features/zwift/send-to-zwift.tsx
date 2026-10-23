import { buildZwo, type IndoorVersion, type Workout } from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { shareFile } from '@/features/sharing/share-file';
import { Button, Text } from '@/ui';

interface SendToZwiftProps {
  workout: Workout;
  indoor: IndoorVersion;
  /** Name of the session as shown in the plan; it becomes the workout name in Zwift. */
  title: string;
}

/**
 * "Send to Zwift" on indoor rides and treadmill runs (CLAUDE.md "Zwift", phase 1): shares the
 * .zwo file so the user can save it into Zwift's workouts folder, with a short how-to for PC/Mac.
 * Direct delivery through Zwift Training Connections replaces this once Zwift approves Peakr.
 */
export function SendToZwift({ workout, indoor, title }: SendToZwiftProps) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  const built = buildZwo(workout, { name: title, indoor });
  if (!built.ok) return null;
  const { file } = built;

  const send = async () => {
    setError(false);
    const result = await shareFile({
      name: file.fileName,
      mime: 'application/xml',
      bytes: new TextEncoder().encode(file.xml),
      uti: 'public.xml',
    });
    setError(result !== 'shared');
  };

  return (
    <View testID="send-to-zwift">
      <Button variant="secondary" label={t('zwift.send')} onPress={send} />
      {error ? <Text tone="secondary">{t('zwift.error')}</Text> : null}
      <Text variant="caption" tone="secondary">
        {t('zwift.howTo')}
      </Text>
      {file.notes.map((note) => (
        <Text key={note.key} variant="caption" tone="secondary">
          {`ⓘ ${t(note.key as never)}`}
        </Text>
      ))}
    </View>
  );
}
