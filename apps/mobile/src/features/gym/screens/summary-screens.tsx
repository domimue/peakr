import {
  DEFAULT_SHARE_SETTINGS,
  defaultChoice,
  summarizeSession,
  toGymSession,
  type ShareChoice,
  type CustomExercise,
  type GymSession,
  type GymSet,
  type PersonalRecord,
  type SessionSummary,
} from '@peakr/engine';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { newId } from '@/data/ids';
import { usePlanActions } from '@/features/plan/queries';
import {
  Button,
  Card,
  FieldShell,
  Icon,
  Input,
  Screen,
  spacing,
  StatTile,
  TileGrid,
  Text,
  useTheme,
} from '@/ui';

import { formatKg, formatSet, formatVolume } from '../format';
import { useLiveSessionStore } from '../live-session-store';
import { useFinishLiveSession, useGymExercises, useGymHistory } from '../queries';
import { exerciseName } from '../session';
import { useShareSettings } from '../sharing/queries';
import { ShareChoicePanel, ShareStatusPanel } from '../sharing/share-panels';
import { shareSession } from '../sharing/share-store';

/**
 * Finishing a live session (CLAUDE.md "Gym"): duration, total volume, sets, muscle groups and new
 * records, a note, then save. Saving stores the session, marks the planned workout done and lets
 * the endurance plan react to it (unified load model).
 */
export function FinishScreen() {
  const { t } = useTranslation();
  const live = useLiveSessionStore((s) => s.live);
  const finished = useLiveSessionStore((s) => s.finished);
  const custom = useGymExercises();
  const history = useGymHistory();
  const finish = useFinishLiveSession();
  const planActions = usePlanActions();
  const [endedAt] = useState(() => Date.now());
  const [notes, setNotes] = useState(live?.notes ?? '');
  // Where this session goes: the saved defaults (off until switched on once), per session.
  const shareSettings = useShareSettings();
  const [picked, setChoice] = useState<ShareChoice | null>(null);
  const choice = picked ?? defaultChoice(shareSettings.data ?? DEFAULT_SHARE_SETTINGS);

  const preview = useMemo(
    () => (live ? toGymSession(live, endedAt, newId, notes) : null),
    [live, endedAt, notes],
  );

  if (!live || !preview || custom.isPending || history.isPending) return <Screen />;
  const customList = custom.data ?? [];
  const summary = summarizeSession(
    preview.session,
    preview.sets,
    history.data?.sets ?? [],
    customList,
  );

  const save = () => {
    const { session, sets } = toGymSession(live, endedAt, newId, notes);
    finish.mutate(
      { session, sets },
      {
        onSuccess: () => {
          planActions.absorbGym(session, sets, customList);
          shareSession({ session, sets, custom: customList }, choice);
          finished();
          // Back from the saved session leads to the Gym tab, not to the finished live screen.
          router.dismissTo('/gym');
          router.push({ pathname: '/gym/history/[id]', params: { id: session.id } });
        },
      },
    );
  };

  return (
    <Screen>
      <SummaryView
        session={preview.session}
        sets={preview.sets}
        summary={summary}
        custom={customList}
      />
      <FieldShell label={t('gym.summary.notes')}>
        <Input
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder={t('gym.summary.notesPlaceholder')}
          accessibilityLabel={t('gym.summary.notes')}
        />
      </FieldShell>
      <ShareChoicePanel choice={choice} onChange={setChoice} />
      <Button label={t('gym.summary.save')} disabled={finish.isPending} onPress={save} />
      <Button variant="secondary" label={t('gym.summary.back')} onPress={() => router.back()} />
    </Screen>
  );
}

/** A stored session from the history (read only). */
export function SessionDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const custom = useGymExercises();
  const history = useGymHistory();
  if (custom.isPending || history.isPending) return <Screen />;
  const session = history.data?.sessions.find((s) => s.id === id);
  if (!session) {
    return (
      <Screen>
        <Text tone="secondary">{t('gym.history.notFound')}</Text>
      </Screen>
    );
  }
  const sets = (history.data?.sets ?? []).filter((s) => s.sessionId === id);
  // Records against what came before this session only.
  const earlier = new Set(
    (history.data?.sessions ?? []).filter((s) => s.startedAt < session.startedAt).map((s) => s.id),
  );
  const summary = summarizeSession(
    session,
    sets,
    (history.data?.sets ?? []).filter((s) => earlier.has(s.sessionId)),
    custom.data ?? [],
  );
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {session.title || t('strength.quickLog.title')}
      </Text>
      <Text tone="secondary">{session.date}</Text>
      <SummaryView session={session} sets={sets} summary={summary} custom={custom.data ?? []} />
      {session.notes ? (
        <Card>
          <Text variant="label">{t('gym.summary.notes')}</Text>
          <Text>{session.notes}</Text>
        </Card>
      ) : null}
      <ShareStatusPanel data={{ session, sets, custom: custom.data ?? [] }} />
    </Screen>
  );
}

function SummaryView({
  session,
  sets,
  summary,
  custom,
}: {
  session: GymSession;
  sets: readonly GymSet[];
  summary: SessionSummary;
  custom: readonly CustomExercise[];
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const kg = t('units.kg');
  const byExercise = new Map<string, GymSet[]>();
  for (const s of sets) byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);

  return (
    <>
      <TileGrid>
        <StatTile
          value={t('strength.minutes', { count: summary.durationMin })}
          label={t('gym.summary.duration')}
          testID="summary-duration"
        />
        <StatTile
          value={`${formatVolume(summary.volumeKg, i18n.language)} ${kg}`}
          label={t('gym.summary.volume')}
          testID="summary-volume"
        />
        <StatTile
          value={String(summary.sets)}
          label={t('gym.summary.sets')}
          testID="summary-sets"
        />
      </TileGrid>

      {summary.records.length > 0 ? (
        <Card testID="summary-records">
          <View style={styles.row}>
            <Icon name="trophy" color={colors.typeStrength} />
            <Text variant="heading">
              {t('gym.summary.records', { count: summary.records.length })}
            </Text>
          </View>
          {summary.records.map((r) => (
            <Text key={`${r.exerciseId}-${r.kind}`}>
              {exerciseName(t, r.exerciseId, custom)}: {recordText(t, r, kg)}
            </Text>
          ))}
        </Card>
      ) : null}

      {summary.muscles.length > 0 ? (
        <Card>
          <Text variant="label">{t('gym.summary.muscles')}</Text>
          <Text tone="secondary">
            {summary.muscles
              .map((m) => `${t(`gym.muscles.${m.muscle}` as never)} ${formatKg(m.sets)}`)
              .join(' · ')}
          </Text>
        </Card>
      ) : null}

      {session.kind === 'detailed'
        ? [...byExercise.entries()].map(([exerciseId, list]) => (
            <Card key={exerciseId}>
              <Text variant="label">{exerciseName(t, exerciseId, custom)}</Text>
              {list.map((s, i) => (
                <Text key={s.id} tone={s.setType === 'warmup' ? 'secondary' : 'default'}>
                  {s.setType === 'working' ? String(i + 1) : t(`gym.setTypes.${s.setType}`)} ·{' '}
                  {formatSet(s, t('units.s'), kg)}
                  {s.rpe !== undefined ? ` · RPE ${s.rpe}` : ''}
                </Text>
              ))}
            </Card>
          ))
        : null}
    </>
  );
}

export function recordText(t: TFunction, r: PersonalRecord, kg: string): string {
  const value =
    r.kind === 'reps' || r.kind === 'repsAtWeight'
      ? String(r.value)
      : r.kind === 'duration'
        ? `${r.value} ${t('units.s')}`
        : r.kind === 'distance'
          ? `${r.value} m`
          : `${formatKg(Math.round(r.value * 10) / 10)} ${kg}`;
  return t(`gym.records.kinds.${r.kind}` as never, {
    value,
    weight: r.weightKg !== undefined ? formatKg(r.weightKg) : '',
    unit: kg,
  });
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
