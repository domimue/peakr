import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { EmailForm } from '@/features/funnel/email-form';
import { getVisitor, loadQuiz } from '@/features/funnel/visitor';
import { messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';

const t = messages.funnel.email;

export const metadata = privateMetadata(t.metaTitle);

export default function EmailPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">{t.title}</h1>
        <p className="text-muted">{t.lead}</p>
      </div>
      <Suspense fallback={null}>
        <Email />
      </Suspense>
    </main>
  );
}

/** Signed-in accounts have an email already; nobody without finished answers gets here. */
async function Email() {
  const visitor = await getVisitor();
  const quiz = visitor ? await loadQuiz(visitor).catch(() => null) : null;
  if (!visitor || !quiz?.finished) redirect('/quiz');
  if (!visitor.user.is_anonymous) redirect('/quiz/forecast');
  return <EmailForm email={quiz.email} />;
}
