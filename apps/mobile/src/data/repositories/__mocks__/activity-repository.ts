import { activityKey, type ActivityLink, type SourceActivity, type SourceRef } from '@peakr/engine';

import type { StoredActivity, StoredMatchQuestion } from '../activity-repository';

/** In-memory activity repository for Jest (`jest.mock('@/data/repositories/activity-repository')`). */

export type { StoredActivity, StoredMatchQuestion } from '../activity-repository';

export const store = {
  activities: [] as StoredActivity[],
  links: [] as (ActivityLink & { planId: string })[],
  questions: [] as StoredMatchQuestion[],
};

export function resetStore(): void {
  store.activities = [];
  store.links = [];
  store.questions = [];
}

export const listActivities = jest.fn(async () => store.activities);

export const applyActivities = jest.fn(
  (upserts: readonly SourceActivity[], deletes: readonly SourceRef[], now = Date.now()) => {
    const gone = new Set(deletes.map(activityKey));
    store.activities = store.activities.filter((a) => !gone.has(activityKey(a)));
    for (const a of upserts) {
      const old = store.activities.find((x) => activityKey(x) === activityKey(a));
      store.activities = store.activities.filter((x) => activityKey(x) !== activityKey(a));
      store.activities.push({ ...a, importedAt: now, handled: old?.handled ?? false });
    }
    store.links = store.links.filter((l) => !gone.has(l.activityKey));
  },
);

export const markHandled = jest.fn((refs: readonly SourceRef[]) => {
  const keys = new Set(refs.map(activityKey));
  store.activities = store.activities.map((a) =>
    keys.has(activityKey(a)) ? { ...a, handled: true } : a,
  );
});

export const listLinks = jest.fn(async () => store.links);

export const addLinks = jest.fn((planId: string, links: readonly ActivityLink[]) => {
  for (const l of links) {
    if (!store.links.some((x) => x.activityKey === l.activityKey))
      store.links.push({ ...l, planId });
  }
});

export const removeLink = jest.fn((key: string) => {
  store.links = store.links.filter((l) => l.activityKey !== key);
});

export const listQuestions = jest.fn(async () => [...store.questions]);

export const saveQuestions = jest.fn(async (questions: readonly StoredMatchQuestion[]) => {
  store.questions = [...questions];
});
