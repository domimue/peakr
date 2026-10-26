import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { photoUri } from '@/data/body-photos';
import type { BodyPhoto } from '@/data/db/schema';
import { supabase } from '@/data/supabase';
import { radius, Text, useTheme } from '@/ui';

/**
 * A progress photo: the copy on this device, else a short-lived signed URL of the private upload
 * (never a public link). Shows "No photo" while there is none.
 */
export function ProgressPhoto({
  photo,
  size,
  testID,
}: {
  photo: BodyPhoto | undefined;
  size: number;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const uri = useQuery({
    queryKey: ['body', 'photo', photo?.localUri ?? null, photo?.remotePath ?? null],
    queryFn: () => photoUri(supabase, photo),
    enabled: Boolean(photo && !photo.removed),
    // Signed URLs live an hour; ask again well before.
    staleTime: 30 * 60 * 1000,
  });
  const box = { width: size, height: size * 1.33, borderColor: colors.border };
  if (!uri.data) {
    return (
      <View style={[styles.box, styles.empty, box]} testID={testID}>
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.checkIn.noPhoto')}
        </Text>
      </View>
    );
  }
  return (
    <Image
      testID={testID}
      source={{ uri: uri.data }}
      style={[styles.box, box]}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  empty: { alignItems: 'center', justifyContent: 'center' },
});
