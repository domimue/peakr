import {
  getTemplate,
  parseReps,
  type CustomExercise,
  type ExercisePrefill,
  type SetLog,
} from '@peakr/engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import type { StrengthLogEntry } from '@/data/repositories/strength-repository';
import { Button, Card, Input, radius, Screen, spacing, Stepper, Text, useTheme } from '@/ui';

import { useActiveWorkoutStore } from '../active-workout-store';
import {
  useCustomExercises,
  useRoutines,
  useSaveStrengthLog,
  useStrengthLogs,
  useStrengthSetup,
} from '../queries';
import {
  exerciseHowTo,
  exerciseName,
  lastSetsFor,
  newLogEntry,
  planWorkoutSession,
  prefillSession,
  routineSession,
  templateSession,
  type StrengthSession,
} from '../session';

export interface StrengthWorkoutParams {
  routineId?: string;
  templateId?: string;
}

/** Resolves what to train: a routine, a library session, or the planned workout handed over. */
export function StrengthWorkoutScreen({ routineId, templateId }: StrengthWorkoutParams) {
  const { t } = useTranslation();
  const planned = useActiveWorkoutStore((s) => s.workout);
  const setup = useStrengthSetup();
  const routines = useRoutines();
  const custom = useCustomExercises();
  const logs = useStrengthLogs();

  if (setup.isPending || routines.isPending || custom.isPending || logs.isPending)
    return <Screen />;

  let session: StrengthSession | null = null;
  if (routineId) {
    const routine = routines.data?.find((r) => r.id === routineId);
    session = routine ? routineSession(routine) : null;
  } else if (templateId) {
    session = templateSession(templateId, setup.data?.equipment);
  } else if (planned?.sport === 'strength') {
    session = planWorkoutSession(planned);
  }
  if (!session) {
    return (
      <Screen>
        <Text tone="secondary">{t('strength.workout.notFound')}</Text>
      </Screen>
    );
  }
  const routineName = session.sourceId.startsWith('routine:')
    ? routines.data?.find((r) => `routine:${r.id}` === session.sourceId)?.name
    : undefined;
  const title =
    session.title ||
    routineName ||
    (session.sourceId.startsWith('routine:')
      ? t('strength.types.routine')
      : (t(`strength.types.${getTemplate(session.sourceId).type}` as never) as string));
  return (
    <WorkoutLogger
      session={{ ...session, title }}
      custom={custom.data ?? []}
      logs={logs.data ?? []}
    />
  );
}

interface SetDraft {
  weight: string;
  /** Reps, or seconds for timed exercises. */
  value: string;
  rpe: string;
  done: boolean;
}

const toText = (n: number | undefined) => (n === undefined ? '' : String(n));

function parseNumber(text: string): number | undefined {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function WorkoutLogger({
  session,
  custom,
  logs,
}: {
  session: StrengthSession;
  custom: readonly CustomExercise[];
  logs: readonly StrengthLogEntry[];
}) {
  const { t } = useTranslation();
  const save = useSaveStrengthLog();
  const today = todayIso();
  const prefill = useMemo(
    () => prefillSession(session, logs, today, custom),
    // The session and history are fixed for this visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [sets, setSets] = useState<SetDraft[][]>(() =>
    prefill.map((p) =>
      p.sets.map((s) => ({
        weight: toText(s.weightKg),
        value: toText(s.reps ?? s.durationSec),
        rpe: '',
        done: false,
      })),
    ),
  );
  const [durationMin, setDurationMin] = useState(session.durationMin);
  const [error, setError] = useState<string | undefined>();

  const updateSet = (ei: number, si: number, patch: Partial<SetDraft>) =>
    setSets((all) =>
      all.map((list, i) =>
        i === ei ? list.map((s, j) => (j === si ? { ...s, ...patch } : s)) : list,
      ),
    );

  const finish = () => {
    const logged: SetLog[] = [];
    prefill.forEach((p, ei) => {
      const timed = parseReps(session.exercises[ei]?.reps ?? '')?.unit === 'sec';
      for (const s of sets[ei] ?? []) {
        if (!s.done) continue;
        const value = parseNumber(s.value);
        logged.push({
          exerciseId: p.exerciseId,
          weightKg: parseNumber(s.weight) || undefined,
          ...(timed ? { durationSec: value } : { reps: value }),
          rpe: parseNumber(s.rpe),
        });
      }
    });
    if (logged.length === 0) {
      setError(t('strength.workout.noSets'));
      return;
    }
    save.mutate(
      newLogEntry({
        date: today,
        title: session.title,
        sourceId: session.sourceId,
        log: { kind: 'detailed', durationMin, sets: logged },
      }),
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {session.title}
      </Text>
      {prefill.map((p, ei) => (
        <ExerciseCard
          key={`${p.exerciseId}-${ei}`}
          prefill={p}
          exercise={session.exercises[ei]}
          custom={custom}
          last={lastSetsFor(logs, p.exerciseId, today)?.sets}
          sets={sets[ei] ?? []}
          onChange={(si, patch) => updateSet(ei, si, patch)}
        />
      ))}
      <Stepper
        label={t('strength.workout.duration')}
        value={durationMin}
        min={5}
        max={180}
        step={5}
        onChange={setDurationMin}
        format={(n) => t('strength.minutes', { count: n })}
        decreaseLabel={t('common.decrease')}
        increaseLabel={t('common.increase')}
      />
      {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button label={t('strength.workout.finish')} disabled={save.isPending} onPress={finish} />
      <Button
        variant="secondary"
        label={t('strength.workout.quickLogInstead')}
        onPress={() =>
          router.replace({
            pathname: '/strength/quick-log',
            params: { sourceId: session.sourceId },
          })
        }
      />
    </Screen>
  );
}

function ExerciseCard({
  prefill,
  exercise,
  custom,
  last,
  sets,
  onChange,
}: {
  prefill: ExercisePrefill;
  exercise: StrengthSession['exercises'][number] | undefined;
  custom: readonly CustomExercise[];
  last: SetLog[] | undefined;
  sets: SetDraft[];
  onChange: (setIndex: number, patch: Partial<SetDraft>) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [showHowTo, setShowHowTo] = useState(false);
  const name = exerciseName(t, prefill.exerciseId, custom, exercise?.name);
  const howTo = exerciseHowTo(t, prefill.exerciseId, custom);
  const timed = parseReps(exercise?.reps ?? '')?.unit === 'sec';
  const valueLabel = timed ? t('strength.workout.seconds') : t('strength.workout.reps');

  return (
    <Card accessibilityLabel={name}>
      <Text variant="heading">{name}</Text>
      {prefill.variationOf ? (
        <Text variant="caption">
          {t('strength.workout.progressed', { from: exerciseName(t, prefill.variationOf, custom) })}
        </Text>
      ) : null}
      <Text variant="caption" tone="secondary">
        {t('strength.workout.prescription', {
          sets: sets.length,
          reps: exercise?.reps ?? '',
          rest: prefill.restSec,
        })}
      </Text>
      {last ? (
        <Text variant="caption" tone="secondary">
          {t('strength.workout.lastTime', {
            sets: last
              .map((s) =>
                s.weightKg
                  ? `${s.weightKg} kg × ${s.reps ?? s.durationSec ?? ''}`
                  : String(s.reps ?? s.durationSec ?? ''),
              )
              .join(', '),
          })}
        </Text>
      ) : null}
      {howTo ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => setShowHowTo(!showHowTo)}>
            <Text style={{ color: colors.accentLine }}>
              {showHowTo ? t('strength.workout.hideHowTo') : t('strength.workout.howTo')}
            </Text>
          </Pressable>
          {showHowTo ? <Text>{howTo}</Text> : null}
        </>
      ) : null}
      {sets.map((s, si) => (
        <View key={si} style={styles.setRow}>
          <Text style={styles.setLabel}>{si + 1}</Text>
          <View style={styles.input}>
            <Input
              value={s.weight}
              onChangeText={(weight) => onChange(si, { weight })}
              keyboardType="decimal-pad"
              placeholder={t('units.kg')}
              accessibilityLabel={t('strength.workout.weightLabel', { name, set: si + 1 })}
            />
          </View>
          <View style={styles.input}>
            <Input
              value={s.value}
              onChangeText={(value) => onChange(si, { value })}
              keyboardType="number-pad"
              placeholder={valueLabel}
              accessibilityLabel={`${valueLabel}, ${name}, ${si + 1}`}
            />
          </View>
          <View style={styles.rpe}>
            <Input
              value={s.rpe}
              onChangeText={(rpe) => onChange(si, { rpe })}
              keyboardType="decimal-pad"
              placeholder={t('strength.workout.rpe')}
              accessibilityLabel={t('strength.workout.rpeLabel', { name, set: si + 1 })}
            />
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: s.done }}
            accessibilityLabel={t('strength.workout.doneLabel', { name, set: si + 1 })}
            onPress={() => onChange(si, { done: !s.done })}
            style={[
              styles.check,
              {
                borderColor: s.done ? colors.accentLine : colors.border,
                backgroundColor: s.done ? colors.accent : colors.surface,
              },
            ]}
          >
            <Text style={{ color: s.done ? colors.onAccent : colors.textMuted }}>✓</Text>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  setLabel: { width: 20, fontWeight: '600' },
  input: { flex: 1 },
  rpe: { width: 64 },
  check: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
