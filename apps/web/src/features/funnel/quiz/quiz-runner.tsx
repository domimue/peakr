'use client';

import {
  clearAnswer,
  prepareAnswers,
  setAnswer,
  stepInsight,
  stepIssues,
  stepQuestions,
  visibleSteps,
  type QuizAnswers,
} from '@peakr/quiz';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { primaryButton, secondaryButton } from '@/components/ui';
import { messages } from '@/i18n';
import { t } from '@/i18n/plan';

import { saveQuizProgress } from '../quiz-actions';
import { localToday } from './today';
import { QuestionInput } from './question-input';

const f = messages.funnel.quiz;

export interface QuizStart {
  answers: QuizAnswers;
  stepId: string | null;
  finished: boolean;
}

/**
 * The shared onboarding quiz on the website (CLAUDE.md "Web funnel flow"): the steps, questions,
 * branching, validation and insights all come from `@peakr/quiz`, exactly as in the app. One step
 * per screen with an animated progress bar and an insight card between steps; the answers are
 * saved under the visitor's (anonymous) Supabase user after every step, so they can resume.
 */
export function QuizRunner({
  initial,
  signedIn,
}: {
  initial: QuizStart | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [today] = useState(localToday);
  const [given, setGiven] = useState<QuizAnswers>(initial?.answers ?? {});
  const [stepId, setStepId] = useState<string | null>(initial?.stepId ?? null);
  const [onInsightScreen, setOnInsight] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [started, setStarted] = useState(false);
  const [saveError, setSaveError] = useState<'step' | 'finish' | null>(null);
  const [finishing, startFinishing] = useTransition();

  const answers = prepareAnswers(given, today);
  // No Strava calibration step on the website (that is an app feature).
  const steps = visibleSteps(answers);
  const found = steps.findIndex((s) => s.id === stepId);
  const index = found < 0 ? 0 : found;
  const step = steps[index];
  const insight = step ? stepInsight(step, answers, today) : null;
  const onInsight = onInsightScreen && insight !== null;
  const resumable = Object.keys(initial?.answers ?? {}).length > 0;

  const save = (next: { stepId: string | null; finished: boolean }) =>
    saveQuizProgress({ answers: given, ...next, ...(next.finished ? { quizDate: today } : {}) });

  const goTo = (id: string, insightScreen: boolean, dir: 1 | -1) => {
    setStepId(id);
    setOnInsight(insightScreen);
    setDirection(dir);
    window.scrollTo({ top: 0 });
  };

  if (!started) {
    return (
      <Intro
        resumable={resumable}
        finished={initial?.finished ?? false}
        signedIn={signedIn}
        onStart={() => setStarted(true)}
        onRestart={() => {
          setGiven({});
          setStepId(null);
          setStarted(true);
          void saveQuizProgress({ answers: {}, stepId: null, finished: false });
        }}
        onForecast={() => router.push('/quiz/forecast')}
      />
    );
  }
  if (!step) return null;

  const questions = stepQuestions(step, answers);
  const issues = stepIssues(step, answers, today);
  const isLast = index === steps.length - 1;

  const back = () => {
    const previous = steps[index - 1];
    if (onInsight) goTo(step.id, false, -1);
    else if (previous) goTo(previous.id, false, -1);
    else setStarted(false);
  };

  const next = () => {
    if (!onInsight && insight) return goTo(step.id, true, 1);
    const following = steps[index + 1];
    if (following) {
      goTo(following.id, false, 1);
      void save({ stepId: following.id, finished: false }).then((ok) =>
        setSaveError(ok ? null : 'step'),
      );
      return;
    }
    startFinishing(async () => {
      const ok = await save({ stepId: step.id, finished: true });
      setSaveError(ok ? null : 'finish');
      if (ok) router.push('/quiz/email');
    });
  };

  const progress = (index + (onInsight ? 1 : 0.35)) / steps.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          aria-label={t('quiz.back')}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-2xl hover:bg-surface"
        >
          ‹
        </button>
        <div
          role="progressbar"
          aria-label={t('quiz.progress', { current: index + 1, total: steps.length })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent-line transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="min-w-10 text-right text-sm text-muted tabular-nums">
          {`${index + 1}/${steps.length}`}
        </span>
      </div>

      <div
        key={`${step.id}-${onInsight ? 'insight' : 'questions'}`}
        className={`flex flex-col gap-8 ${direction > 0 ? 'quiz-enter-forward' : 'quiz-enter-back'}`}
      >
        {onInsight && insight ? (
          <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-6">
            <span className="self-start rounded-full bg-surface-2 px-3 py-0.5 text-sm font-bold">
              {t('quiz.insights.title')}
            </span>
            <h2 className="text-xl">{t(insight.key, insight.params)}</h2>
          </section>
        ) : (
          questions.map((q) => (
            <QuestionInput
              key={q.id}
              question={q}
              answers={answers}
              issues={issues.filter((i) => i.questionId === q.id)}
              onAnswer={(v) => setGiven((g) => setAnswer(g, q.id, v))}
              onClear={() => setGiven((g) => clearAnswer(g, q.id))}
            />
          ))
        )}
      </div>

      {saveError ? (
        <p role="alert" className="text-sm text-error-text">
          {saveError === 'finish' ? f.finishError : f.saveError}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background px-4 py-4">
        <button
          type="button"
          onClick={next}
          disabled={(!onInsight && issues.length > 0) || finishing}
          className={`${primaryButton} w-full`}
        >
          {onInsight
            ? t('quiz.continue')
            : isLast && !insight
              ? t('quiz.seeForecast')
              : t('quiz.next')}
        </button>
      </div>
    </div>
  );
}

function Intro({
  resumable,
  finished,
  signedIn,
  onStart,
  onRestart,
  onForecast,
}: {
  resumable: boolean;
  finished: boolean;
  signedIn: boolean;
  onStart: () => void;
  onRestart: () => void;
  onForecast: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl sm:text-3xl">{t('quiz.intro.title')}</h1>
        <p className="text-lg text-muted">{t('quiz.intro.text')}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {(['zones', 'week', 'forecast'] as const).map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden="true">•</span>
            {t(`quiz.intro.points.${p}`)}
          </li>
        ))}
      </ul>
      <p className="rounded-2xl bg-surface p-4 font-semibold">{t('quiz.intro.free')}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={finished ? onForecast : onStart} className={primaryButton}>
          {resumable ? t('quiz.intro.resume') : t('quiz.intro.start')}
        </button>
        {resumable ? (
          <button type="button" onClick={onRestart} className={secondaryButton}>
            {t('quiz.intro.restart')}
          </button>
        ) : null}
      </div>
      {signedIn ? null : (
        <p className="text-sm text-muted">
          {f.haveAccount}{' '}
          <Link href="/login?next=/account" className="font-medium underline underline-offset-2">
            {f.logIn}
          </Link>
        </p>
      )}
    </div>
  );
}
