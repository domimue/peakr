import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PHOTO_SLOTS, type PhotoSlot } from '@/data/body-photos';
import { ChipGroup, ListState, Screen, SegmentedControl, spacing, Text } from '@/ui';

import { dateText } from '../components/check-in-section';
import { ProgressPhoto } from '../components/progress-photo';
import { useMeasurements } from '../queries';

/** Body → Check-in → Compare photos: any two dates side by side, one view (front/side/back). */
export function PhotoCompareScreen() {
  const { t, i18n } = useTranslation();
  const checkIns = useMeasurements();
  const [slot, setSlot] = useState<PhotoSlot>('front');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  if (checkIns.isPending) return <ListState kind="loading" label={t('common.loading')} />;

  const withPhoto = (checkIns.data ?? []).filter((c) => {
    const p = c.photos[slot];
    return p && !p.removed;
  });
  if (withPhoto.length < 2) {
    return (
      <Screen>
        <SegmentedControl
          options={PHOTO_SLOTS.map((s) => ({ value: s, label: t(`bodyAddon.checkIn.slots.${s}`) }))}
          value={slot}
          onChange={setSlot}
        />
        <Text tone="secondary" testID="compare-empty">
          {t('bodyAddon.checkIn.compareEmpty')}
        </Text>
      </Screen>
    );
  }
  const options = withPhoto.map((c) => ({ value: c.id, label: dateText(c.day, i18n.language) }));
  const a = withPhoto.find((c) => c.id === from) ?? withPhoto[0];
  const b = withPhoto.find((c) => c.id === to) ?? withPhoto[withPhoto.length - 1];

  return (
    <Screen>
      <SegmentedControl
        options={PHOTO_SLOTS.map((s) => ({ value: s, label: t(`bodyAddon.checkIn.slots.${s}`) }))}
        value={slot}
        onChange={setSlot}
      />
      <View style={styles.row} testID="compare-pair">
        {[a, b].map((c, i) =>
          c ? (
            <View key={`${c.id}-${i}`} style={styles.col}>
              <Text variant="label">{dateText(c.day, i18n.language)}</Text>
              <ProgressPhoto photo={c.photos[slot]} size={150} testID={`compare-${i}`} />
            </View>
          ) : null,
        )}
      </View>
      <ChipGroup
        label={t('bodyAddon.checkIn.compareFrom')}
        options={options}
        selected={a ? [a.id] : []}
        onToggle={setFrom}
      />
      <ChipGroup
        label={t('bodyAddon.checkIn.compareTo')}
        options={options}
        selected={b ? [b.id] : []}
        onToggle={setTo}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1, gap: spacing.xs, alignItems: 'center' },
});
