import {
  absorbActivity,
  activityKeys,
  dedupeActivities,
  findWorkout,
  matchActivities,
  matchScore,
  setWorkoutStatus,
  type Activity,
} from '@peakr/engine';

import { todayIso } from '../ids';
import * as activityRepo from '../repositories/activity-repository';
import * as planRepo from '../repositories/plan-repository';
import { hrZonesOf, plannedKmFor } from './apply';

/**
 * The user's answers about synced activities (CLAUDE.md "After import"): which planned workout an
 * activity was, "none of these" (it counts as an unplanned session towards the week's load and
 * the planned workout stays open), and undoing an automatic link.
 */

async function activityOf(key: string): Promise<Activity | null> {
  const records = await activityRepo.listActivities();
  return dedupeActivities(records).find((a) => activityKeys(a).includes(key)) ?? null;
}

async function dropQuestion(key: string): Promise<void> {
  const open = await activityRepo.listQuestions();
  await activityRepo.saveQuestions(open.filter((q) => q.activityKey !== key));
}

/** `workoutId`: the planned workout it was; `null`: none of these. */
export async function answerQuestion(
  key: string,
  workoutId: string | null,
  today = todayIso(),
): Promise<void> {
  const [stored, activity] = await Promise.all([planRepo.getPlan(), activityOf(key)]);
  if (stored && activity) {
    if (workoutId) {
      const result = setWorkoutStatus(stored.state, workoutId, 'done');
      if (result.ok) await planRepo.savePlanState(stored.id, result.value);
      activityRepo.addLinks(stored.id, [{ activityKey: activity.key, workoutId }]);
    } else {
      const result = absorbActivity(stored.state, stored.input, activity, hrZonesOf(stored), today);
      if (result.state !== stored.state) await planRepo.savePlanState(stored.id, result.state);
    }
  }
  await dropQuestion(key);
}

/**
 * Undo of an automatic link: the link goes, the workout is open again (unless the user had marked
 * it done by hand before), and the activity becomes a question so it is never lost.
 */
export async function undoLink(key: string, workoutId: string, wasDone: boolean): Promise<void> {
  const [stored, activity, links] = await Promise.all([
    planRepo.getPlan(),
    activityOf(key),
    activityRepo.listLinks(),
  ]);
  activityRepo.removeLink(key);
  if (!stored || !activity) return;
  let state = stored.state;
  if (!wasDone) {
    const reopened = setWorkoutStatus(state, workoutId, 'planned');
    if (reopened.ok) {
      state = reopened.value;
      await planRepo.savePlanState(stored.id, state);
    }
  }
  const others = links.filter((l) => l.activityKey !== key && l.planId === stored.id);
  const { questions } = matchActivities(
    state,
    [activity],
    new Set(others.map((l) => l.activityKey)),
    new Set(others.map((l) => l.workoutId)),
    plannedKmFor(stored),
  );
  const workout = findWorkout(state.plan, workoutId);
  const offered = questions[0]?.candidates ?? [];
  // The workout it was linked to is always one of the choices.
  const candidates =
    workout && !offered.some((c) => c.workoutId === workoutId)
      ? [
          {
            workoutId,
            score: matchScore(workout, activity, plannedKmFor(stored)(workout, activity)),
          },
          ...offered,
        ]
      : offered;
  const open = await activityRepo.listQuestions();
  await activityRepo.saveQuestions([
    ...open.filter((q) => q.activityKey !== key),
    {
      activityKey: key,
      planId: stored.id,
      candidates,
      sport: activity.sport,
      date: activity.date,
      durationSec: activity.durationSec,
      distanceM: activity.distanceM,
      source: activity.source,
    },
  ]);
}
