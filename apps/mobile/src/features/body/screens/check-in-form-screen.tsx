import {
  CORE_MEASUREMENTS,
  EXTRA_MEASUREMENTS,
  measurementWarning,
  navyBodyFat,
  weightWarning,
  type MeasurementField,
} from '@peakr/engine';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PHOTO_SLOTS, type PhotoSlot } from '@/data/body-photos';
import { todayIso } from '@/data/ids';
import type { Measurement } from '@/data/repositories/body-repository';
import { useEntitlement } from '@/features/billing/billing-store';
import {
  Button,
  Card,
  ListState,
  numeric,
  Screen,
  SegmentedControl,
  spacing,
  Text,
  TextField,
} from '@/ui';

import { previousMeasurements, useHistory, useScaleBodyFat } from '../check-in-data';
import { ProgressPhoto } from '../components/progress-photo';
import { useBodyProfile } from '../profile';
import { useMeasurements, useSaveCheckInForm } from '../queries';

type FatMode = 'manual' | 'navy' | 'scale';

const parse = (s: string | undefined) => {
  if (s === undefined) return null;
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Body → Check-in → New / Edit: date, weight, body fat (entered, US Navy estimate or the scale's
 * value from Health data – an estimate is always labelled as one), the core measurements with a
 * measuring instruction and a plausibility warning each, the extra ones collapsible, front / side
 * / back photos (private) and a note. Opened with `day` it edits that day's check-in.
 */
export function CheckInFormScreen() {
  const { t } = useTranslation();
  const guard = useEntitlement('body_nutrition');
  const params = useLocalSearchParams<{ day?: string }>();
  const history = useHistory();
  const checkIns = useMeasurements();
  if (history.isPending || checkIns.isPending)
    return <ListState kind="loading" label={t('common.loading')} />;
  if (!guard.canWrite) return <Redirect href="/body/check-in" />;
  const editDay = params.day && ISO.test(params.day) ? params.day : null;
  const existing = editDay ? history.days.find((d) => d.day === editDay) : undefined;
  return (
    <CheckInForm
      key={editDay ?? 'new'}
      initialDay={editDay ?? todayIso()}
      existing={existing?.checkIn ?? null}
      weighIn={existing?.weighIn ?? null}
      all={checkIns.data ?? []}
    />
  );
}

function CheckInForm({
  initialDay,
  existing,
  weighIn,
  all,
}: {
  initialDay: string;
  existing: Measurement | null;
  weighIn: { id: string; weightKg: number } | null;
  all: readonly Measurement[];
}) {
  const { t } = useTranslation();
  const profile = useBodyProfile();
  const history = useHistory();
  const save = useSaveCheckInForm();
  const [day, setDay] = useState(initialDay);
  const [weight, setWeight] = useState(weighIn ? String(weighIn.weightKg) : '');
  const [fatMode, setFatMode] = useState<FatMode>(existing?.bodyFatSource ?? 'manual');
  const [fat, setFat] = useState(
    existing?.bodyFatSource === 'manual' && existing.bodyFatPct !== null
      ? String(existing.bodyFatPct)
      : '',
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(existing?.values ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [showExtra, setShowExtra] = useState(
    EXTRA_MEASUREMENTS.some((m) => existing?.values[m.key] !== undefined),
  );
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, string | null>>>({});
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const scale = useScaleBodyFat(day);

  const today = todayIso();
  const dayValid = ISO.test(day) && day <= today && !Number.isNaN(Date.parse(day));
  const kg = parse(weight);
  const previousWeight = history.days.find(
    (d) => d.day < day && d.values.weightKg !== null && d.weighIn,
  );
  const weightWarn =
    kg !== null
      ? weightWarning(
          kg,
          previousWeight
            ? { value: previousWeight.values.weightKg as number, day: previousWeight.day }
            : null,
          day,
        )
      : null;
  const prev = previousMeasurements(all, day, existing?.id);
  const cm = Object.fromEntries(
    Object.entries(values)
      .map(([k, v]) => [k, parse(v)] as const)
      .filter((e): e is readonly [string, number] => e[1] !== null),
  );
  const warnOf = (f: MeasurementField) => {
    const value = cm[f.key];
    return value !== undefined ? measurementWarning(f.key, value, prev[f.key] ?? null, day) : null;
  };
  const sex = profile.data?.values.sex;
  const heightCm = profile.data?.values.heightCm;
  const navy =
    sex && heightCm
      ? navyBodyFat({
          sex,
          heightCm,
          neckCm: cm.neck,
          waistCm: cm.waist,
          bellyCm: cm.belly,
          hipCm: cm.hip,
        })
      : null;
  const fatPct =
    fatMode === 'manual' ? parse(fat) : fatMode === 'navy' ? navy : (scale.data?.value ?? null);
  const fatInvalid =
    fatMode === 'manual' && fat.trim() !== '' && !(fatPct !== null && fatPct >= 2 && fatPct <= 70);
  const outOfRange =
    weightWarn === 'outOfRange' ||
    [...CORE_MEASUREMENTS, ...EXTRA_MEASUREMENTS].some((f) => warnOf(f) === 'outOfRange');
  const shownPhoto = (slot: PhotoSlot) => {
    const picked = photos[slot];
    if (picked === null) return undefined;
    if (picked) return { localUri: picked, remotePath: null };
    const p = existing?.photos[slot];
    return p && !p.removed ? p : undefined;
  };
  const hasCheckIn =
    Object.keys(cm).length > 0 ||
    fatPct !== null ||
    note.trim() !== '' ||
    PHOTO_SLOTS.some((s) => shownPhoto(s));

  const pick = async (slot: PhotoSlot, from: 'camera' | 'library') => {
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t('bodyAddon.checkIn.form.photoPermission'));
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) setPhotos((p) => ({ ...p, [slot]: uri }));
  };

  const submit = () => {
    setError(null);
    if (!dayValid) {
      setError(t('bodyAddon.checkIn.form.invalidDate'));
      return;
    }
    if (kg === null && !hasCheckIn && !existing) {
      setError(t('bodyAddon.checkIn.form.nothing'));
      return;
    }
    save.mutate(
      {
        weighIn:
          kg !== null && (kg !== weighIn?.weightKg || day !== initialDay)
            ? { id: weighIn?.id ?? null, day, weightKg: kg }
            : null,
        checkIn:
          hasCheckIn || existing
            ? {
                id: existing?.id,
                day,
                values: cm,
                bodyFatPct: fatPct,
                bodyFatSource: fatPct !== null ? fatMode : null,
                note: note.trim() || null,
                photos,
              }
            : null,
      },
      { onSuccess: () => router.back() },
    );
  };

  const fieldFor = (f: MeasurementField) => {
    const warn = warnOf(f);
    return (
      <TextField
        key={f.key}
        testID={`measure-${f.key}`}
        label={t(`bodyAddon.checkIn.fields.${f.key}.label`)}
        hint={t(`bodyAddon.checkIn.fields.${f.key}.how`)}
        suffix="cm"
        keyboardType="decimal-pad"
        value={values[f.key] ?? ''}
        onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
        error={warn ? t(`bodyAddon.checkIn.warning.${warn}`) : undefined}
      />
    );
  };

  return (
    <Screen>
      <Card style={styles.stack}>
        <TextField
          testID="check-in-date"
          label={t('bodyAddon.checkIn.form.date')}
          hint={t('bodyAddon.checkIn.form.dateHint')}
          value={day}
          onChangeText={setDay}
          autoCapitalize="none"
        />
        <TextField
          testID="check-in-weight"
          label={t('bodyAddon.checkIn.form.weightOptional')}
          suffix="kg"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          error={weightWarn ? t(`bodyAddon.checkIn.warning.${weightWarn}`) : undefined}
        />
      </Card>

      <Card style={styles.stack}>
        <Text variant="heading">{t('bodyAddon.checkIn.form.measurements')}</Text>
        <Text tone="secondary">{t('bodyAddon.checkIn.form.measurementsHint')}</Text>
        {CORE_MEASUREMENTS.map(fieldFor)}
        <Button
          small
          variant="secondary"
          testID="toggle-extra"
          label={t(showExtra ? 'bodyAddon.checkIn.form.less' : 'bodyAddon.checkIn.form.more')}
          onPress={() => setShowExtra((v) => !v)}
        />
        {showExtra ? EXTRA_MEASUREMENTS.map(fieldFor) : null}
      </Card>

      <Card style={styles.stack} testID="check-in-body-fat">
        <Text variant="heading">{t('bodyAddon.checkIn.form.bodyFat')}</Text>
        <SegmentedControl
          options={(['manual', 'navy', 'scale'] as const).map((m) => ({
            value: m,
            label: t(`bodyAddon.checkIn.form.bodyFatSource.${m}`),
          }))}
          value={fatMode}
          onChange={setFatMode}
        />
        {fatMode === 'manual' ? (
          <TextField
            testID="check-in-fat"
            label={t('bodyAddon.checkIn.form.bodyFat')}
            hint={t('bodyAddon.checkIn.form.bodyFatHint')}
            suffix="%"
            keyboardType="decimal-pad"
            value={fat}
            onChangeText={setFat}
            error={fatInvalid ? t('bodyAddon.checkIn.warning.outOfRange') : undefined}
          />
        ) : fatMode === 'navy' ? (
          <>
            <Text testID="navy-result" style={numeric}>
              {navy !== null
                ? t('bodyAddon.checkIn.form.navyResult', { pct: navy })
                : t('bodyAddon.checkIn.form.navyMissing')}
            </Text>
            <Text variant="caption" tone="secondary">
              {t('bodyAddon.checkIn.form.navyHint')}
            </Text>
          </>
        ) : (
          <Text testID="scale-result" style={numeric}>
            {scale.data
              ? t('bodyAddon.checkIn.form.scaleResult', {
                  pct: scale.data.value,
                  source: t(`bodyAddon.sources.${scale.data.source}`),
                })
              : t('bodyAddon.checkIn.form.scaleMissing')}
          </Text>
        )}
      </Card>

      <Card style={styles.stack}>
        <Text variant="heading">{t('bodyAddon.checkIn.form.photos')}</Text>
        <Text tone="secondary">{t('bodyAddon.checkIn.form.photosHint')}</Text>
        <View style={styles.photos}>
          {PHOTO_SLOTS.map((slot) => {
            const photo = shownPhoto(slot);
            return (
              <View key={slot} style={styles.slot} testID={`slot-${slot}`}>
                <Text variant="label">{t(`bodyAddon.checkIn.slots.${slot}`)}</Text>
                <ProgressPhoto photo={photo} size={88} />
                <Button
                  small
                  variant="secondary"
                  label={t('bodyAddon.checkIn.form.take')}
                  testID={`take-${slot}`}
                  onPress={() => void pick(slot, 'camera')}
                />
                <Button
                  small
                  variant="secondary"
                  label={t('bodyAddon.checkIn.form.pick')}
                  testID={`pick-${slot}`}
                  onPress={() => void pick(slot, 'library')}
                />
                {photo ? (
                  <Button
                    small
                    variant="secondary"
                    icon="trash"
                    label={t('bodyAddon.checkIn.form.removePhoto')}
                    onPress={() => setPhotos((p) => ({ ...p, [slot]: null }))}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

      <Card style={styles.stack}>
        <TextField
          testID="check-in-note"
          label={t('bodyAddon.checkIn.form.note')}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={1000}
        />
      </Card>

      {error ? (
        <Text tone="secondary" testID="check-in-error">
          {error}
        </Text>
      ) : null}
      <Button
        testID="check-in-save"
        label={t('bodyAddon.checkIn.form.save')}
        disabled={outOfRange || fatInvalid || save.isPending}
        onPress={submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: { gap: spacing.xs, alignItems: 'flex-start' },
});
