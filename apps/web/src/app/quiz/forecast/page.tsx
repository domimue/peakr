import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { primaryButton } from '@/components/ui';
import { ForecastView } from '@/features/funnel/forecast-view';
import { funnelPlan, funnelToday } from '@/features/funnel/plan';
import { getVisitor, loadQuiz } from '@/features/funnel/visitor';
import { messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';

const f = messages.funnel.forecast;

export const metadata = privateMetadata(f.metaTitle);

export default function ForecastPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
      <Suspense fallback={null}>
        <Forecast />
      </Suspense>
    </main>
  );
}

async function Forecast() {
  const visitor = await getVisitor();
  const quiz = visitor ? await loadQuiz(visitor).catch(() => null) : null;
  if (!quiz?.finished) redirect('/quiz');
  const result = funnelPlan(quiz.answers, funnelToday(quiz.quizDate));
  if (!result) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>{f.missing}</p>
        <Link href="/quiz" className={primaryButton}>
          {f.continueQuiz}
        </Link>
      </div>
    );
  }
  return <ForecastView result={result} />;
}
