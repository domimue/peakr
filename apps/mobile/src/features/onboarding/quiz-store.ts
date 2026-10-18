import { clearAnswer, setAnswer, type QuizAnswers, type QuizAnswerValue } from '@peakr/quiz';
import { create } from 'zustand';

import * as repo from '@/data/repositories/onboarding-repository';

/**
 * Onboarding quiz state: the given answers (defaults are derived, not stored) and where the user
 * is. Every change is written to SQLite so the quiz resumes after the app was closed.
 */
interface QuizState extends repo.QuizProgress {
  hydrated: boolean;
  /** 1 = forward, -1 = back; drives the screen transition. */
  direction: 1 | -1;
  hydrate: () => Promise<void>;
  answer: (id: string, value: QuizAnswerValue) => void;
  clear: (id: string) => void;
  goTo: (stepId: string, insight: boolean, direction: 1 | -1) => void;
  finish: () => void;
  reset: () => Promise<void>;
}

const EMPTY: repo.QuizProgress = { answers: {}, stepId: null, insight: false, finished: false };

export const useQuizStore = create<QuizState>()((set, get) => {
  const persist = () => {
    const { answers, stepId, insight, finished } = get();
    repo
      .saveQuizProgress({ answers, stepId, insight, finished })
      .catch((e: unknown) => console.error('Saving quiz progress failed', e));
  };
  const update = (patch: Partial<repo.QuizProgress> & { direction?: 1 | -1 }) => {
    set(patch);
    persist();
  };
  return {
    ...EMPTY,
    hydrated: false,
    direction: 1,
    hydrate: async () => {
      if (get().hydrated) return;
      const saved = await repo.getQuizProgress().catch(() => null);
      set({ ...EMPTY, ...saved, hydrated: true });
    },
    answer: (id, value) => update({ answers: setAnswer(get().answers, id, value) }),
    clear: (id) => update({ answers: clearAnswer(get().answers, id) }),
    goTo: (stepId, insight, direction) => update({ stepId, insight, direction }),
    finish: () => update({ finished: true }),
    reset: async () => {
      set({ ...EMPTY, direction: 1 });
      await repo.clearQuizProgress();
    },
  };
});

export function hasProgress(answers: QuizAnswers): boolean {
  return Object.keys(answers).length > 0;
}

/** Local calendar date as ISO (the quiz validates dates against the user's today). */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
