import { getTemplate } from '@peakr/engine';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { todayIso } from '@/data/ids';
import { useStrengthSetup } from '@/features/strength/queries';
import { Button, Card, Screen, Text } from '@/ui';

import { useActiveWorkoutStore } from '../active-workout-store';
import { useLiveSessionStore } from '../live-session-store';
import { useGymExercises, useGymHistory, useGymRoutines } from '../queries';
import {
  emptyLiveSession,
  planWorkoutSession,
  routineSession,
  startLiveSession,
  templateSession,
  type StrengthSession,
} from '../session';

export interface WorkoutParams {
  routineId?: string;
  templateId?: string;
  /** The planned workout handed over from the plan (via the active-workout store). */
  workoutId?: string;
  /** Start an empty session. */
  empty?: boolean;
}

/**
 * Starting a gym session: resolves what to train – a routine, a library session, the planned
 * workout handed over from the plan, or nothing (empty session) – turns it into a live session
 * pre-filled from last time (§8.5) and opens the live screen. A session that is already running is
 * never replaced without asking.
 */
export function WorkoutScreen({ routineId, templateId, workoutId, empty }: WorkoutParams) {
  const { t } = useTranslation();
  const planned = useActiveWorkoutStore((s) => s.workout);
  const setup = useStrengthSetup();
  const routines = useGymRoutines();
  const custom = useGymExercises();
  const history = useGymHistory();
  const { live, hydrated, hydrate, start, discard } = useLiveSessionStore();
  const started = useRef(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const loading =
    !hydrated || setup.isPending || routines.isPending || custom.isPending || history.isPending;

  let session: StrengthSession | null = null;
  if (!loading) {
    if (routineId) {
      const routine = routines.data?.find((r) => r.id === routineId);
      session = routine ? routineSession(routine) : null;
    } else if (templateId) {
      session = templateSession(templateId, setup.data?.equipment);
    } else if (planned?.sport === 'strength' && (!workoutId || planned.id === workoutId)) {
      session = planWorkoutSession(planned);
    }
  }

  const begin = () => {
    if (started.current) return;
    started.current = true;
    const today = todayIso();
    if (empty || !session) {
      start(emptyLiveSession(t('gym.live.emptyTitle'), today));
    } else {
      const routineName = session.sourceId.startsWith('routine:')
        ? routines.data?.find((r) => `routine:${r.id}` === session.sourceId)?.name
        : undefined;
      const title =
        session.title ||
        routineName ||
        (session.sourceId.startsWith('routine:')
          ? t('strength.types.routine')
          : (t(`strength.types.${getTemplate(session.sourceId).type}` as never) as string));
      start(
        startLiveSession(
          { ...session, title },
          history.data ?? { sessions: [], sets: [] },
          today,
          custom.data ?? [],
        ),
      );
    }
    router.replace('/gym/live');
  };

  const canStart = !loading && (empty || session !== null);
  // Nothing running: start right away.
  useEffect(() => {
    if (canStart && !live) begin();
    // `begin` reads the current render's data; it runs once (guarded by `started`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart, live]);

  if (loading) return <Screen />;
  if (!canStart) {
    return (
      <Screen>
        <Text tone="secondary">{t('strength.workout.notFound')}</Text>
      </Screen>
    );
  }
  if (!live) return <Screen />;

  return (
    <Screen>
      <Card>
        <Text variant="heading">{t('gym.live.running.title')}</Text>
        <Text tone="secondary">{t('gym.live.running.body', { title: live.title })}</Text>
      </Card>
      <Button label={t('gym.live.running.continue')} onPress={() => router.replace('/gym/live')} />
      <Button
        variant="danger"
        label={t('gym.live.running.discardAndStart')}
        onPress={() => {
          discard();
          begin();
        }}
      />
      {session ? (
        <Button
          variant="secondary"
          label={t('strength.workout.quickLogInstead')}
          onPress={() =>
            router.replace({
              pathname: '/gym/quick-log',
              params: {
                sourceId: session.sourceId,
                ...(session.plannedWorkoutId ? { workoutId: session.plannedWorkoutId } : {}),
              },
            })
          }
        />
      ) : null}
    </Screen>
  );
}
