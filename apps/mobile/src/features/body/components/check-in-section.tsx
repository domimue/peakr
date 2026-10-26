import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import type { AddonGuard } from '@/features/billing/model';
import { Button, Card, ListState, numeric, spacing, Text, TextField } from '@/ui';

import { useAddCheckIn, useCheckIns, useDeleteCheckIn } from '../queries';

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Body → Check-in: weight (and optionally waist) for a day. Gentle wording, no streaks: a missed
 * weigh-in is never pointed out. Read-only history after the add-on ended.
 */
export function CheckInSection({ guard }: { guard: AddonGuard }) {
  const { t, i18n } = useTranslation();
  const checkIns = useCheckIns();
  const add = useAddCheckIn();
  const remove = useDeleteCheckIn();
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [fat, setFat] = useState('');
  const weightKg = parse(weight);
  const waistCm = parse(waist);
  const fatPct = parse(fat);
  const valid =
    weightKg !== null &&
    weightKg >= 25 &&
    weightKg <= 350 &&
    (waist.trim() === '' || (waistCm !== null && waistCm >= 30 && waistCm <= 250)) &&
    (fat.trim() === '' || (fatPct !== null && fatPct >= 3 && fatPct <= 70));

  if (checkIns.isPending) return <ListState kind="loading" label={t('common.loading')} />;
  const recent = [...(checkIns.data ?? [])].reverse().slice(0, 14);

  return (
    <View style={styles.stack} testID="body-check-in">
      {guard.canWrite ? (
        <Card style={styles.stack}>
          <Text variant="heading">{t('bodyAddon.checkIn.title')}</Text>
          <Text tone="secondary">{t('bodyAddon.checkIn.hint')}</Text>
          <TextField
            label={t('bodyAddon.checkIn.weight')}
            suffix="kg"
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
          />
          <TextField
            label={t('bodyAddon.checkIn.waist')}
            hint={t('bodyAddon.checkIn.waistHint')}
            suffix="cm"
            keyboardType="decimal-pad"
            value={waist}
            onChangeText={setWaist}
          />
          <TextField
            label={t('bodyAddon.checkIn.bodyFat')}
            hint={t('bodyAddon.checkIn.bodyFatHint')}
            suffix="%"
            keyboardType="decimal-pad"
            value={fat}
            onChangeText={setFat}
          />
          <Button
            label={t('bodyAddon.checkIn.save')}
            disabled={!valid || add.isPending}
            onPress={() =>
              weightKg !== null &&
              add.mutate(
                {
                  day: todayIso(),
                  weightKg,
                  waistCm: waist.trim() ? waistCm : null,
                  bodyFatPct: fat.trim() ? fatPct : null,
                  note: null,
                },
                {
                  onSuccess: () => {
                    setWeight('');
                    setWaist('');
                    setFat('');
                  },
                },
              )
            }
          />
        </Card>
      ) : null}

      <Text variant="heading">{t('bodyAddon.checkIn.history')}</Text>
      {recent.length === 0 ? (
        <Text tone="secondary">{t('bodyAddon.checkIn.empty')}</Text>
      ) : (
        <Card style={styles.stack}>
          {recent.map((c) => (
            <View key={c.id} style={styles.row}>
              <Text tone="secondary" style={styles.flex}>
                {new Date(`${c.day}T12:00:00`).toLocaleDateString(i18n.language, {
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
              <Text style={numeric}>
                {c.waistCm !== null
                  ? t('bodyAddon.checkIn.lineWaist', { kg: c.weightKg, cm: c.waistCm })
                  : t('bodyAddon.checkIn.line', { kg: c.weightKg })}
              </Text>
              {guard.canWrite ? (
                <Button
                  small
                  variant="secondary"
                  icon="trash"
                  label={t('bodyAddon.diary.delete')}
                  onPress={() => remove.mutate(c.id)}
                />
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
