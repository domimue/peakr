import { nextMeasureDay, weightWarning, type MeasurementKey } from '@peakr/engine';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import type { AddonGuard } from '@/features/billing/model';
import { Button, Card, ListState, numeric, spacing, Text, TextField } from '@/ui';

import { useHistory, type HistoryDay } from '../check-in-data';
import { importPrototypeFile } from '../import';
import {
  assertCanWrite,
  useAddCheckIn,
  useCheckInSettings,
  useDayKcal,
  useDeleteCheckIn,
  useDeleteMeasurement,
  useFoodDay,
  useSetDayKcal,
} from '../queries';
import { ProgressPhoto } from './progress-photo';

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export const dateText = (day: string, language: string, weekday = false) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(language, {
    ...(weekday ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: 'short',
  });

/** "Waist −1.5 · Hip −0.5" – the measurements that changed since the previous check-in. */
function measurementChanges(t: TFunction, d: HistoryDay): string | null {
  const parts = (Object.entries(d.changes.measurements) as [MeasurementKey, number][])
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${t(`bodyAddon.checkIn.fields.${k}.label`)} ${signed(v)} cm`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Body → Check-in: today's weigh-ins (several a day are fine; the trend uses the day's value),
 * the daily kcal quick entry for people who do not log food, the way into a full check-in
 * (measurements, body fat, photos, note) and the history with edit and delete. Gentle wording, no
 * streaks: a missed weigh-in is never pointed out. Read-only after the add-on ended.
 */
export function CheckInSection({ guard }: { guard: AddonGuard }) {
  const { t, i18n } = useTranslation();
  const today = todayIso();
  const userId = useSessionStore(selectAccountUserId);
  const client = useQueryClient();
  const history = useHistory();
  const settings = useCheckInSettings();
  const food = useFoodDay(today);
  const dayKcal = useDayKcal();
  const add = useAddCheckIn();
  const setKcal = useSetDayKcal();
  const removeWeighIn = useDeleteCheckIn();
  const removeCheckIn = useDeleteMeasurement();
  const [weight, setWeight] = useState('');
  const [intake, setIntake] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (history.isPending) return <ListState kind="loading" label={t('common.loading')} />;

  const days = history.days;
  const todayEntry = days.find((d) => d.day === today);
  const previous = days.find((d) => d.day < today && d.values.weightKg !== null);
  const kg = parse(weight);
  const warning =
    kg !== null
      ? weightWarning(
          kg,
          todayEntry?.weighIn
            ? { value: todayEntry.weighIn.weightKg, day: today }
            : previous?.weighIn
              ? { value: previous.weighIn.weightKg, day: previous.day }
              : null,
          today,
        )
      : null;
  const measureDay = nextMeasureDay(today, settings.data?.measureWeekday ?? 1);
  const todayKcal = (dayKcal.data ?? []).find((d) => d.day === today);
  const intakeText = intake ?? (todayKcal?.intakeKcal != null ? String(todayKcal.intakeKcal) : '');
  const activeText = active ?? (todayKcal?.activeKcal != null ? String(todayKcal.activeKcal) : '');
  const intakeKcal = parse(intakeText);
  const activeKcal = parse(activeText);
  const kcalValid =
    (intakeText.trim() === '' || (intakeKcal !== null && intakeKcal >= 0 && intakeKcal <= 15000)) &&
    (activeText.trim() === '' || (activeKcal !== null && activeKcal >= 0 && activeKcal <= 10000)) &&
    (intakeText.trim() !== '' || activeText.trim() !== '');
  const logsFood = (food.data ?? []).length > 0;

  const doImport = async () => {
    setMessage(null);
    try {
      assertCanWrite();
      const result = await importPrototypeFile(userId);
      if (result.status === 'cancelled') return;
      if (result.status === 'invalid') {
        setMessage(t('bodyAddon.checkIn.importInvalid'));
        return;
      }
      const { imported, skipped, photosNotImported } = result.report;
      setMessage(
        [
          t('bodyAddon.checkIn.imported', { imported, skipped }),
          photosNotImported > 0
            ? t('bodyAddon.checkIn.photosNotImported', { count: photosNotImported })
            : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
      await client.invalidateQueries({ queryKey: ['body'] });
    } catch {
      setMessage(t('bodyAddon.checkIn.importInvalid'));
    }
  };

  const confirmDelete = (d: HistoryDay) =>
    Alert.alert(
      t(d.checkIn ? 'bodyAddon.checkIn.deleteTitle' : 'bodyAddon.checkIn.deleteWeighInTitle'),
      d.checkIn ? t('bodyAddon.checkIn.deleteBody') : undefined,
      [
        { text: t('bodyAddon.checkIn.cancel'), style: 'cancel' },
        {
          text: t('bodyAddon.checkIn.deleteConfirm'),
          style: 'destructive',
          onPress: () => {
            if (d.checkIn) removeCheckIn.mutate(d.checkIn.id);
            for (const w of d.weighIns) removeWeighIn.mutate(w.id);
          },
        },
      ],
    );

  return (
    <View style={styles.stack} testID="body-check-in">
      {guard.canWrite ? (
        <Card style={styles.stack} testID="body-weigh-in">
          <Text variant="heading">{t('bodyAddon.checkIn.weighIns')}</Text>
          <Text tone="secondary">
            {t(
              settings.data?.weighDaily === false
                ? 'bodyAddon.checkIn.weighHintWeekly'
                : 'bodyAddon.checkIn.weighHintDaily',
            )}
          </Text>
          {todayEntry?.weighIns.length ? (
            todayEntry.weighIns.map((w) => (
              <View key={w.id} style={styles.row}>
                <Text style={[styles.flex, numeric]}>
                  {t('bodyAddon.checkIn.weighInAt', {
                    time: new Date(w.createdAt).toLocaleTimeString(i18n.language, {
                      hour: 'numeric',
                      minute: '2-digit',
                    }),
                    kg: w.weightKg,
                  })}
                </Text>
                <Button
                  small
                  variant="secondary"
                  icon="trash"
                  label={t('bodyAddon.checkIn.delete')}
                  onPress={() => removeWeighIn.mutate(w.id)}
                />
              </View>
            ))
          ) : (
            <Text tone="secondary">{t('bodyAddon.checkIn.noWeighIns')}</Text>
          )}
          <TextField
            testID="weigh-in-weight"
            label={t('bodyAddon.checkIn.weight')}
            suffix="kg"
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
            error={warning ? t(`bodyAddon.checkIn.warning.${warning}`) : undefined}
          />
          <Button
            variant="secondary"
            icon="plus"
            label={t('bodyAddon.checkIn.addWeight')}
            disabled={kg === null || warning === 'outOfRange' || add.isPending}
            onPress={() =>
              kg !== null &&
              add.mutate(
                { day: today, weightKg: kg, waistCm: null, bodyFatPct: null, note: null },
                { onSuccess: () => setWeight('') },
              )
            }
          />
        </Card>
      ) : null}

      {guard.canWrite && !logsFood ? (
        <Card style={styles.stack} testID="body-quick-kcal">
          <Text variant="heading">{t('bodyAddon.checkIn.quick.title')}</Text>
          <Text tone="secondary">{t('bodyAddon.checkIn.quick.hint')}</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                testID="quick-intake"
                label={t('bodyAddon.checkIn.quick.intake')}
                suffix="kcal"
                keyboardType="number-pad"
                value={intakeText}
                onChangeText={setIntake}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                testID="quick-active"
                label={t('bodyAddon.checkIn.quick.active')}
                suffix="kcal"
                keyboardType="number-pad"
                value={activeText}
                onChangeText={setActive}
              />
            </View>
          </View>
          <Button
            variant="secondary"
            label={t('bodyAddon.checkIn.quick.save')}
            disabled={!kcalValid || setKcal.isPending}
            onPress={() =>
              setKcal.mutate(
                {
                  day: today,
                  intakeKcal: intakeText.trim() ? Math.round(intakeKcal as number) : null,
                  activeKcal: activeText.trim() ? Math.round(activeKcal as number) : null,
                },
                {
                  onSuccess: () => {
                    setIntake(null);
                    setActive(null);
                    setMessage(t('bodyAddon.checkIn.quick.saved'));
                  },
                },
              )
            }
          />
        </Card>
      ) : null}

      {guard.canWrite ? (
        <Card style={styles.stack}>
          <Text variant="heading">{t('bodyAddon.checkIn.title')}</Text>
          <Text tone="secondary" testID="body-next-measure">
            {measureDay === today
              ? t('bodyAddon.checkIn.next.today')
              : t('bodyAddon.checkIn.next.later', {
                  date: dateText(measureDay, i18n.language, true),
                })}
          </Text>
          <Button
            testID="body-new-check-in"
            label={t('bodyAddon.checkIn.new')}
            onPress={() => router.push('/body/check-in/new')}
          />
          <View style={styles.actions}>
            <Button
              small
              variant="secondary"
              label={t('bodyAddon.checkIn.compare')}
              onPress={() => router.push('/body/check-in/compare')}
            />
            <Button
              small
              variant="secondary"
              icon="bell"
              label={t('bodyAddon.checkIn.rhythm')}
              onPress={() => router.push('/body/check-in/rhythm')}
            />
            <Button
              small
              variant="secondary"
              icon="upload"
              testID="body-import"
              label={t('bodyAddon.checkIn.import')}
              onPress={() => void doImport()}
            />
          </View>
        </Card>
      ) : null}
      {message ? (
        <Text tone="secondary" testID="body-check-in-message">
          {message}
        </Text>
      ) : null}

      <Text variant="heading">{t('bodyAddon.checkIn.history')}</Text>
      {days.length === 0 ? (
        <Text tone="secondary">{t('bodyAddon.checkIn.empty')}</Text>
      ) : (
        days.slice(0, 30).map((d) => {
          const changes = measurementChanges(t, d);
          const fat = d.values.bodyFatPct;
          return (
            <Card key={d.day} style={styles.stack} testID={`history-${d.day}`}>
              <View style={styles.row}>
                <View style={[styles.flex, styles.stackTight]}>
                  <Text variant="label">{dateText(d.day, i18n.language, true)}</Text>
                  {d.values.weightKg !== null ? (
                    <Text style={numeric}>
                      {t('bodyAddon.checkIn.line', { kg: d.values.weightKg })}
                      {d.changes.weightKg !== null ? ` (${signed(d.changes.weightKg)} kg)` : ''}
                    </Text>
                  ) : null}
                  {fat !== null ? (
                    <Text tone="secondary" style={numeric}>
                      {t(
                        d.checkIn?.bodyFatSource === 'navy'
                          ? 'bodyAddon.checkIn.bodyFatEstimate'
                          : 'bodyAddon.checkIn.bodyFatLine',
                        { pct: fat },
                      )}
                    </Text>
                  ) : null}
                  {changes ? (
                    <Text variant="caption" tone="secondary" style={numeric}>
                      {changes}
                    </Text>
                  ) : null}
                  {d.checkIn?.note ? <Text tone="secondary">{d.checkIn.note}</Text> : null}
                </View>
                {d.checkIn?.photos.front || d.checkIn?.photos.side || d.checkIn?.photos.back ? (
                  <ProgressPhoto
                    size={56}
                    testID={`thumb-${d.day}`}
                    photo={d.checkIn.photos.front ?? d.checkIn.photos.side ?? d.checkIn.photos.back}
                  />
                ) : null}
              </View>
              {guard.canWrite ? (
                <View style={styles.actions}>
                  <Button
                    small
                    variant="secondary"
                    icon="edit"
                    testID={`edit-${d.day}`}
                    label={t('bodyAddon.checkIn.edit')}
                    onPress={() =>
                      router.push({ pathname: '/body/check-in/new', params: { day: d.day } })
                    }
                  />
                  <Button
                    small
                    variant="secondary"
                    icon="trash"
                    testID={`delete-${d.day}`}
                    label={t('bodyAddon.checkIn.delete')}
                    onPress={() => confirmDelete(d)}
                  />
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  stackTight: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
});
