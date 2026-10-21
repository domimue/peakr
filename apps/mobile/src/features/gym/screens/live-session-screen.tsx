import {
  effectiveValues,
  elapsedSec,
  liveProgress,
  remainingSec,
  resolveExercise,
  restProgress,
  setOneRepMax,
  SET_TYPES,
  type CustomExercise,
  type LiveExercise,
  type LiveSet,
  type SetType,
} from '@peakr/engine';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { newId, todayIso } from '@/data/ids';
import {
  Button,
  Card,
  IconButton,
  NumericKeypad,
  ProgressBar,
  radius,
  Screen,
  spacing,
  Text,
  useTheme,
} from '@/ui';

import { ExercisePicker } from '../exercise-picker';
import { ExerciseFigure } from '../figures/exercise-figure';
import { entryText, formatClock, formatKg, formatSet, parseEntry } from '../format';
import { setRestLabel, useLiveSessionStore } from '../live-session-store';
import { PlateCalculator } from '../plate-calculator';
import { useGymExercises, useGymHistory, useSaveGymExercise } from '../queries';
import { exerciseName, liveExerciseFor } from '../session';
import { useNow } from '../use-now';

type Field = 'weightKg' | 'reps' | 'durationSec';

interface KeypadTarget {
  entryId: string;
  setId: string;
  field: Field;
}

const SET_TYPE_SHORT: Record<SetType, string> = {
  warmup: 'W',
  working: '',
  drop: 'D',
  failure: 'F',
};
const REST_STEP_SEC = 15;

/**
 * The live gym session (CLAUDE.md "Gym"): one card per exercise with a row per set, a big keypad
 * for weight and reps, the rest timer, supersets, the plate calculator and an estimated 1RM per
 * set. The screen stays awake; everything is saved on every tap (see `live-session-store.ts`).
 */
export function LiveSessionScreen() {
  const { t } = useTranslation();
  useKeepAwake('gym-live-session');
  const { live, hydrated, hydrate, dispatch, discard } = useLiveSessionStore();
  const custom = useGymExercises();
  const history = useGymHistory();
  const saveExercise = useSaveGymExercise();
  const now = useNow(1000, live !== null);
  const [keypad, setKeypad] = useState<KeypadTarget | null>(null);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);
  const [plates, setPlates] = useState<number | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const customList = useMemo(() => custom.data ?? [], [custom.data]);
  const nameOf = (e: LiveExercise) => exerciseName(t, e.exerciseId, customList, e.name);

  useEffect(() => {
    setRestLabel((entryId) => {
      const e = useLiveSessionStore.getState().live?.exercises.find((x) => x.entryId === entryId);
      return e ? exerciseName(t, e.exerciseId, customList, e.name) : '';
    });
  }, [t, customList]);

  if (!hydrated) return <Screen />;
  if (!live) {
    return (
      <Screen>
        <Text tone="secondary">{t('gym.live.none')}</Text>
        <Button label={t('gym.live.backToGym')} onPress={() => router.replace('/gym')} />
      </Screen>
    );
  }

  const progress = liveProgress(live);

  const openKeypad = (target: KeypadTarget) => {
    const set = findSet(target.entryId, target.setId);
    setDraft(entryText(set?.[target.field]));
    setKeypad(target);
  };

  function findSet(entryId: string, setId: string): LiveSet | undefined {
    return live?.exercises.find((e) => e.entryId === entryId)?.sets.find((s) => s.id === setId);
  }

  const commitDraft = (target: KeypadTarget, text: string) => {
    dispatch({
      type: 'updateSet',
      entryId: target.entryId,
      setId: target.setId,
      patch: { [target.field]: parseEntry(text) },
    });
  };

  const complete = (entryId: string, setId: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dispatch({ type: 'completeSet', entryId, setId });
  };

  /** Weight → reps (or seconds) → the next open set's weight. */
  const next = () => {
    if (!keypad) return;
    commitDraft(keypad, draft);
    const exercise = live.exercises.find((e) => e.entryId === keypad.entryId);
    if (keypad.field === 'weightKg' && exercise) {
      openKeypadAfterCommit({ ...keypad, field: exercise.timed ? 'durationSec' : 'reps' });
      return;
    }
    const idx = exercise?.sets.findIndex((s) => s.id === keypad.setId) ?? -1;
    const following = exercise?.sets.slice(idx + 1).find((s) => !s.completed);
    if (exercise && following) {
      openKeypadAfterCommit({ entryId: exercise.entryId, setId: following.id, field: 'weightKg' });
    } else {
      setKeypad(null);
    }
  };

  /** The store has the committed value only after this render; read the target set fresh. */
  const openKeypadAfterCommit = (target: KeypadTarget) => {
    const set = useLiveSessionStore
      .getState()
      .live?.exercises.find((e) => e.entryId === target.entryId)
      ?.sets.find((s) => s.id === target.setId);
    setDraft(entryText(set?.[target.field]));
    setKeypad(target);
  };

  const completeFromKeypad = () => {
    if (!keypad) return;
    commitDraft(keypad, draft);
    complete(keypad.entryId, keypad.setId);
    setKeypad(null);
  };

  const keypadExercise = keypad ? live.exercises.find((e) => e.entryId === keypad.entryId) : null;
  const keypadSet = keypad ? findSet(keypad.entryId, keypad.setId) : undefined;
  const keypadPlaceholder =
    keypad && keypadSet
      ? effectiveValues({ ...keypadSet, [keypad.field]: undefined })[keypad.field]
      : undefined;
  const fieldLabel = (f: Field) =>
    f === 'weightKg'
      ? t('gym.live.weight')
      : f === 'reps'
        ? t('strength.workout.reps')
        : t('strength.workout.seconds');

  const finish = () => {
    if (progress.done === 0) {
      Alert.alert(t('gym.live.finishEmpty.title'), t('gym.live.finishEmpty.body'));
      return;
    }
    setKeypad(null);
    router.push('/gym/summary');
  };

  const confirmDiscard = () =>
    Alert.alert(t('gym.live.discard.title'), t('gym.live.discard.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('gym.live.discard.confirm'),
        style: 'destructive',
        onPress: () => {
          discard();
          router.replace('/gym');
        },
      },
    ]);

  return (
    <Screen>
      <Card testID="live-header">
        <View style={styles.headRow}>
          <View style={styles.flex}>
            <Text variant="heading" accessibilityRole="header">
              {live.title}
            </Text>
            <Text variant="caption" tone="secondary">
              {t('gym.live.setsDone', { done: progress.done, total: progress.total })}
            </Text>
          </View>
          <Text
            variant="subtitle"
            accessibilityLabel={t('gym.live.elapsedLabel', {
              time: formatClock(elapsedSec(live, now)),
            })}
            testID="live-elapsed"
          >
            {formatClock(elapsedSec(live, now))}
          </Text>
        </View>
        {live.rest ? (
          <RestBar
            now={now}
            exerciseName={(() => {
              const e = live.exercises.find((x) => x.entryId === live.rest?.entryId);
              return e ? nameOf(e) : '';
            })()}
          />
        ) : null}
      </Card>

      {live.exercises.length === 0 ? <Text tone="secondary">{t('gym.live.emptyHint')}</Text> : null}

      {live.exercises.map((e) => (
        <ExerciseCard
          key={e.entryId}
          exercise={e}
          name={nameOf(e)}
          custom={customList}
          supersetOrder={
            e.supersetGroup
              ? live.exercises.filter((x) => x.supersetGroup === e.supersetGroup).indexOf(e) + 1
              : 0
          }
          focusSetId={live.focus?.entryId === e.entryId ? live.focus.setId : undefined}
          onEdit={(setId, field) => openKeypad({ entryId: e.entryId, setId, field })}
          onToggle={(set) =>
            set.completed
              ? dispatch({ type: 'uncompleteSet', entryId: e.entryId, setId: set.id })
              : complete(e.entryId, set.id)
          }
          onSetType={(setId, setType) =>
            dispatch({ type: 'setSetType', entryId: e.entryId, setId, setType })
          }
          onAddSet={() => dispatch({ type: 'addSet', entryId: e.entryId, setId: newId() })}
          onRemoveSet={(setId) => dispatch({ type: 'removeSet', entryId: e.entryId, setId })}
          onRest={(restSec) => dispatch({ type: 'setRestSec', entryId: e.entryId, restSec })}
          onPlates={(kg) => setPlates(kg)}
          onRemove={() =>
            Alert.alert(t('gym.live.removeExercise.title', { name: nameOf(e) }), undefined, [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('gym.live.removeExercise.confirm'),
                style: 'destructive',
                onPress: () => dispatch({ type: 'removeExercise', entryId: e.entryId }),
              },
            ])
          }
        />
      ))}

      {picking ? (
        <Card>
          <ExercisePicker
            custom={customList}
            onPick={(exerciseId) => {
              dispatch({
                type: 'addExercise',
                exercise: liveExerciseFor(
                  exerciseId,
                  history.data ?? { sessions: [], sets: [] },
                  todayIso(),
                  customList,
                ),
              });
              setPicking(false);
            }}
            onCreate={(exercise) => {
              saveExercise.mutate(exercise);
              dispatch({
                type: 'addExercise',
                exercise: liveExerciseFor(
                  exercise.id,
                  history.data ?? { sessions: [], sets: [] },
                  todayIso(),
                  [...customList, exercise],
                ),
              });
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        </Card>
      ) : (
        <Button
          variant="secondary"
          icon="plus"
          label={t('gym.live.addExercise')}
          onPress={() => setPicking(true)}
        />
      )}

      <Button label={t('gym.live.finish')} onPress={finish} />
      <Button variant="danger" label={t('gym.live.discard.button')} onPress={confirmDiscard} />

      <NumericKeypad
        visible={keypad !== null}
        title={
          keypad && keypadExercise
            ? t('gym.live.keypadTitle', {
                field: fieldLabel(keypad.field),
                name: nameOf(keypadExercise),
                set: keypadExercise.sets.findIndex((s) => s.id === keypad.setId) + 1,
              })
            : ''
        }
        value={draft}
        placeholder={keypadPlaceholder !== undefined ? formatKg(keypadPlaceholder) : undefined}
        unit={
          keypad?.field === 'weightKg'
            ? t('units.kg')
            : keypad?.field === 'durationSec'
              ? t('units.s')
              : undefined
        }
        allowDecimal={keypad?.field === 'weightKg'}
        steps={
          keypad?.field === 'weightKg'
            ? [
                { delta: -2.5, label: '−2.5' },
                { delta: -1.25, label: '−1.25' },
                { delta: 1.25, label: '+1.25' },
                { delta: 2.5, label: '+2.5' },
              ]
            : [
                { delta: -1, label: '−1' },
                { delta: 1, label: '+1' },
              ]
        }
        onChange={setDraft}
        nextLabel={t('gym.live.next')}
        onNext={next}
        doneLabel={keypadSet && !keypadSet.completed ? t('gym.live.completeSet') : undefined}
        onDone={completeFromKeypad}
        onClose={() => {
          if (keypad) commitDraft(keypad, draft);
          setKeypad(null);
        }}
        closeLabel={t('gym.live.keypadDone')}
        deleteLabel={t('gym.live.delete')}
      />
      <PlateCalculator
        visible={plates !== null}
        targetKg={plates ?? 0}
        onClose={() => setPlates(null)}
      />
    </Screen>
  );
}

/** Countdown of the rest with −15 s / +15 s / skip; vibrates once when it runs out. */
function RestBar({ now: tick, exerciseName: name }: { now: number; exerciseName: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rest = useLiveSessionStore((s) => s.live?.rest ?? null);
  const dispatch = useLiveSessionStore((s) => s.dispatch);
  const buzzed = useRef<number | null>(null);
  // A timer that just started (or was extended) is never read with a time from before it.
  const now = rest ? Math.max(tick, rest.startedAt) : tick;
  const left = rest ? remainingSec(rest, now) : 0;

  useEffect(() => {
    if (!rest || left > 0 || buzzed.current === rest.endsAt) return;
    buzzed.current = rest.endsAt;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [rest, left]);

  if (!rest) return null;
  const done = left === 0;
  return (
    <View style={[styles.rest, { backgroundColor: colors.surface2 }]} testID="rest-timer">
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <Text variant="caption" tone="secondary">
            {done ? t('gym.live.rest.over') : t('gym.live.rest.label', { name })}
          </Text>
          <Text
            variant="title"
            accessibilityLabel={t('gym.live.rest.remaining', { time: formatClock(left) })}
            accessibilityLiveRegion="polite"
          >
            {formatClock(left)}
          </Text>
        </View>
        <IconButton
          icon="close"
          accessibilityLabel={t('gym.live.rest.skip')}
          onPress={() => dispatch({ type: 'skipRest' })}
        />
      </View>
      <ProgressBar
        progress={restProgress(rest, now)}
        accessibilityLabel={t('gym.live.rest.progress')}
      />
      <View style={styles.restButtons}>
        <View style={styles.flex}>
          <Button
            small
            variant="secondary"
            label={t('gym.live.rest.minus', { sec: REST_STEP_SEC })}
            onPress={() => dispatch({ type: 'extendRest', sec: -REST_STEP_SEC })}
          />
        </View>
        <View style={styles.flex}>
          <Button
            small
            variant="secondary"
            label={t('gym.live.rest.plus', { sec: REST_STEP_SEC })}
            onPress={() => dispatch({ type: 'extendRest', sec: REST_STEP_SEC })}
          />
        </View>
        <View style={styles.flex}>
          <Button
            small
            variant="secondary"
            label={t('gym.live.rest.skip')}
            onPress={() => dispatch({ type: 'skipRest' })}
          />
        </View>
      </View>
    </View>
  );
}

interface ExerciseCardProps {
  exercise: LiveExercise;
  name: string;
  custom: readonly CustomExercise[];
  /** Position in its superset (1, 2, …), 0 = no superset. */
  supersetOrder: number;
  focusSetId?: string;
  onEdit: (setId: string, field: Field) => void;
  onToggle: (set: LiveSet) => void;
  onSetType: (setId: string, setType: SetType) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onRest: (restSec: number) => void;
  onPlates: (kg: number) => void;
  onRemove: () => void;
}

function ExerciseCard({
  exercise: e,
  name,
  custom,
  supersetOrder,
  focusSetId,
  onEdit,
  onToggle,
  onSetType,
  onAddSet,
  onRemoveSet,
  onRest,
  onPlates,
  onRemove,
}: ExerciseCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [menu, setMenu] = useState(false);
  const resolved = resolveExercise(e.exerciseId, custom);
  const barbell = resolved?.equipment.some(
    (x) => x === 'barbell' || x === 'smith' || x === 'trapBar',
  );
  const lastWeight = [...e.sets].reverse().find((s) => effectiveValues(s).weightKg)?.weightKg;
  const plateKg =
    lastWeight ??
    effectiveValues(e.sets[0] ?? { id: '', setType: 'working', completed: false }).weightKg;
  const valueField: Field = e.timed ? 'durationSec' : 'reps';
  const labels = setLabels(e.sets);

  return (
    <Card accessibilityLabel={name} testID={`live-exercise-${e.exerciseId}`}>
      <View style={styles.headRow}>
        {resolved ? <ExerciseFigure exercise={resolved} size={44} /> : null}
        <View style={styles.flex}>
          <Text variant="heading">{name}</Text>
          <Text variant="caption" tone="secondary">
            {[
              supersetOrder > 0 ? t('gym.live.superset', { n: supersetOrder }) : null,
              e.prescription ? t('gym.live.target', { target: e.prescription }) : null,
              t('gym.live.restShort', { time: formatClock(e.restSec) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <IconButton
          icon="tune"
          accessibilityLabel={t('gym.live.exerciseMenu', { name })}
          onPress={() => setMenu(!menu)}
        />
      </View>
      {supersetOrder > 0 ? (
        <View style={[styles.supersetLine, { backgroundColor: colors.typeStrength }]} />
      ) : null}

      {menu ? (
        <View style={[styles.menu, { borderColor: colors.border }]}>
          <View style={styles.headRow}>
            <Text style={styles.flex}>{t('gym.live.restTime')}</Text>
            <Button
              small
              variant="secondary"
              label={t('gym.live.rest.minus', { sec: REST_STEP_SEC })}
              onPress={() => onRest(Math.max(0, e.restSec - REST_STEP_SEC))}
            />
            <Text style={styles.restValue}>{formatClock(e.restSec)}</Text>
            <Button
              small
              variant="secondary"
              label={t('gym.live.rest.plus', { sec: REST_STEP_SEC })}
              onPress={() => onRest(e.restSec + REST_STEP_SEC)}
            />
          </View>
          {barbell ? (
            <Button
              small
              variant="secondary"
              label={t('gym.plates.open')}
              onPress={() => onPlates(plateKg ?? 20)}
            />
          ) : null}
          <Button
            small
            variant="danger"
            label={t('gym.live.removeExercise.button')}
            onPress={onRemove}
          />
        </View>
      ) : null}

      <View style={styles.setHead}>
        <Text variant="micro" tone="secondary" style={styles.colSet}>
          {t('gym.live.col.set')}
        </Text>
        <Text variant="micro" tone="secondary" style={styles.colTarget}>
          {t('gym.live.col.target')}
        </Text>
        <Text variant="micro" tone="secondary" style={styles.colInput}>
          {t('units.kg')}
        </Text>
        <Text variant="micro" tone="secondary" style={styles.colInput}>
          {e.timed ? t('units.s') : t('strength.workout.reps')}
        </Text>
        <View style={styles.colCheck} />
      </View>

      {e.sets.map((s, i) => {
        const label = labels[i] as string;
        const shown = effectiveValues({
          ...s,
          weightKg: undefined,
          reps: undefined,
          durationSec: undefined,
          rpe: undefined,
        });
        const oneRm = s.completed ? setOneRepMax(s) : undefined;
        const target =
          s.target && Object.keys(s.target).length > 0 ? formatSet(s.target, t('units.s')) : '';
        const previous = s.previous ? formatSet(s.previous, t('units.s')) : '';
        return (
          <View key={s.id}>
            <View
              style={[
                styles.setRow,
                s.completed && { backgroundColor: colors.surface2 },
                focusSetId === s.id && !s.completed && { borderColor: colors.accentLine },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('gym.live.setTypeLabel', {
                  set: i + 1,
                  type: t(`gym.setTypes.${s.setType}`),
                })}
                accessibilityHint={t('gym.live.setTypeHint')}
                onPress={() =>
                  onSetType(
                    s.id,
                    SET_TYPES[(SET_TYPES.indexOf(s.setType) + 1) % SET_TYPES.length] as SetType,
                  )
                }
                onLongPress={() => onRemoveSet(s.id)}
                style={[styles.colSet, styles.setBadge, { borderColor: colors.border }]}
              >
                <Text
                  variant="label"
                  style={s.setType === 'working' ? undefined : { color: colors.typeStrength }}
                >
                  {label}
                </Text>
              </Pressable>
              <View style={styles.colTarget}>
                <Text variant="caption">{target || '–'}</Text>
                {previous ? (
                  <Text variant="micro" tone="secondary">
                    {t('gym.live.previous', { set: previous })}
                  </Text>
                ) : null}
              </View>
              <Cell
                value={s.weightKg}
                placeholder={shown.weightKg}
                label={t('gym.live.cellLabel', { field: t('gym.live.weight'), name, set: i + 1 })}
                onPress={() => onEdit(s.id, 'weightKg')}
              />
              <Cell
                value={s[valueField]}
                placeholder={shown[valueField]}
                label={t('gym.live.cellLabel', {
                  field: e.timed ? t('strength.workout.seconds') : t('strength.workout.reps'),
                  name,
                  set: i + 1,
                })}
                onPress={() => onEdit(s.id, valueField)}
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: s.completed }}
                accessibilityLabel={t('strength.workout.doneLabel', { name, set: i + 1 })}
                onPress={() => onToggle(s)}
                hitSlop={6}
                style={[
                  styles.colCheck,
                  styles.check,
                  {
                    borderColor: s.completed ? colors.accentLine : colors.border,
                    backgroundColor: s.completed ? colors.accent : colors.surface,
                  },
                ]}
              >
                <Text
                  variant="label"
                  style={{ color: s.completed ? colors.onAccent : colors.textMuted }}
                >
                  ✓
                </Text>
              </Pressable>
            </View>
            {oneRm !== undefined ? (
              <Text variant="micro" tone="secondary" style={styles.oneRm}>
                {t('gym.live.oneRm', {
                  value: formatKg(Math.round(oneRm * 2) / 2),
                  unit: t('units.kg'),
                })}
              </Text>
            ) : null}
          </View>
        );
      })}
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <Button
            small
            variant="secondary"
            icon="plus"
            label={t('gym.live.addSet')}
            onPress={onAddSet}
          />
        </View>
        {e.sets.length > 0 ? (
          <View style={styles.flex}>
            <Button
              small
              variant="secondary"
              label={t('gym.live.removeSet')}
              onPress={() => onRemoveSet((e.sets[e.sets.length - 1] as LiveSet).id)}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** A tappable value cell; shows the entered value, else the suggestion greyed. */
function Cell({
  value,
  placeholder,
  label,
  onPress,
}: {
  value?: number;
  placeholder?: number;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const text =
    value !== undefined ? formatKg(value) : placeholder !== undefined ? formatKg(placeholder) : '–';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.colInput,
        styles.cell,
        { borderColor: colors.border, backgroundColor: pressed ? colors.surface2 : colors.bg },
      ]}
    >
      <Text variant="label" style={{ color: value !== undefined ? colors.text : colors.textMuted }}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rest: { borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm },
  restButtons: { flexDirection: 'row', gap: spacing.sm },
  restValue: { minWidth: 48, textAlign: 'center' },
  menu: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm },
  supersetLine: { height: 3, borderRadius: radius.pill },
  setHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  colSet: { width: 36 },
  colTarget: { flex: 1.3 },
  colInput: { flex: 1 },
  colCheck: { width: 52 },
  setBadge: {
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cell: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oneRm: { textAlign: 'right', paddingRight: spacing.xs },
});

/** Working sets are numbered 1, 2, …; warm-up, drop and failure sets show their letter. */
export function setLabels(sets: readonly LiveSet[]): string[] {
  let working = 0;
  return sets.map((s) => {
    if (s.setType !== 'warmup') working += 1;
    return SET_TYPE_SHORT[s.setType] || String(working);
  });
}
