import { Suspense } from 'react';

import { QuizRunner } from '@/features/funnel/quiz/quiz-runner';
import { getVisitor, loadQuiz } from '@/features/funnel/visitor';
import { messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';

export const metadata = privateMetadata(messages.funnel.quiz.metaTitle);

export default function QuizPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col px-4 py-8 sm:py-12">
      <Suspense fallback={null}>
        <Quiz />
      </Suspense>
    </main>
  );
}

/** Resumes from the saved answers of this browser's (anonymous) user, if any. */
async function Quiz() {
  const visitor = await getVisitor();
  const saved = visitor ? await loadQuiz(visitor).catch(() => null) : null;
  return (
    <QuizRunner
      initial={saved && { answers: saved.answers, stepId: saved.stepId, finished: saved.finished }}
      signedIn={visitor !== null && !visitor.user.is_anonymous}
    />
  );
}
