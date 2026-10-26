import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import {
  validateBodyProfile,
  type BodyProfile,
  type BodyProfileField,
  type BodySex,
} from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { Button, Card, SegmentedControl, spacing, Text, TextField } from '@/ui';

import { useSaveBodyProfile, type BodyProfileState } from '../profile';

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1990, (m ?? 1) - 1, d ?? 1);
};
const parseNumber = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

/**
 * Asks only for the profile values that are missing, the first time the add-on opens (CLAUDE.md
 * "Add-on rules": one profile, no duplicate fields). Saved into the shared profile, so training
 * and Body read the same values afterwards.
 */
export function ProfileSetupCard({ state }: { state: BodyProfileState }) {
  const { t, i18n } = useTranslation();
  const save = useSaveBodyProfile();
  const ask = new Set<BodyProfileField>(state.missing);
  const [sex, setSex] = useState<BodySex | undefined>(state.values.sex);
  const [birthDate, setBirthDate] = useState<string | undefined>(state.values.birthDate);
  const [height, setHeight] = useState(state.values.heightCm?.toString() ?? '');
  const [weight, setWeight] = useState(state.values.weightKg?.toString() ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);

  const values: Partial<BodyProfile> = {
    ...(ask.has('sex') && sex ? { sex } : {}),
    ...(ask.has('birthDate') && birthDate ? { birthDate } : {}),
    ...(ask.has('heightCm') && parseNumber(height) !== undefined
      ? { heightCm: parseNumber(height) }
      : {}),
    ...(ask.has('weightKg') && parseNumber(weight) !== undefined
      ? { weightKg: parseNumber(weight) }
      : {}),
  };
  const complete = [...ask].every((f) => values[f] !== undefined);
  const check = validateBodyProfile({ ...state.values, ...values }, todayIso());
  const invalid = complete && !check.ok;
  const picked = birthDate ? fromIso(birthDate) : undefined;
  const picker = (
    <DateTimePicker
      value={picked ?? new Date(1990, 0, 1)}
      mode="date"
      maximumDate={new Date()}
      onValueChange={(_e, date) => {
        setPickerOpen(false);
        setBirthDate(toIso(date));
      }}
      onDismiss={() => setPickerOpen(false)}
    />
  );

  return (
    <Card style={styles.card} testID="body-profile-setup">
      <Text variant="heading">{t('bodyAddon.profile.title')}</Text>
      <Text tone="secondary">{t('bodyAddon.profile.hint')}</Text>
      {ask.has('sex') ? (
        <View style={styles.field}>
          <Text variant="caption">{t('bodyAddon.profile.sex')}</Text>
          <SegmentedControl
            options={[
              { value: 'female', label: t('bodyAddon.profile.female') },
              { value: 'male', label: t('bodyAddon.profile.male') },
            ]}
            value={sex ?? ('' as BodySex)}
            onChange={setSex}
          />
        </View>
      ) : null}
      {ask.has('birthDate') ? (
        <View style={styles.field}>
          <Text variant="caption">{t('bodyAddon.profile.birthDate')}</Text>
          {Platform.OS === 'android' ? (
            <>
              <Button
                variant="secondary"
                label={
                  picked
                    ? picked.toLocaleDateString(i18n.language, { dateStyle: 'long' })
                    : t('bodyAddon.profile.pickDate')
                }
                onPress={() => setPickerOpen(true)}
              />
              {pickerOpen ? picker : null}
            </>
          ) : (
            picker
          )}
        </View>
      ) : null}
      {ask.has('heightCm') ? (
        <TextField
          label={t('bodyAddon.profile.height')}
          suffix="cm"
          keyboardType="decimal-pad"
          value={height}
          onChangeText={setHeight}
        />
      ) : null}
      {ask.has('weightKg') ? (
        <TextField
          label={t('bodyAddon.profile.weight')}
          suffix="kg"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
        />
      ) : null}
      {invalid || save.isError ? (
        <Text tone="secondary">{t('bodyAddon.profile.invalid')}</Text>
      ) : null}
      <Button
        label={t('bodyAddon.profile.save')}
        disabled={!complete || invalid || save.isPending}
        onPress={() => save.mutate(values)}
      />
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.profile.shared')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  field: { gap: spacing.xs },
});
