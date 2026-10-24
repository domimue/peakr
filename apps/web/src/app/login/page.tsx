import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { card } from '@/components/ui';
import { safeNext } from '@/features/auth/next-path';
import { SignInForm } from '@/features/auth/sign-in-form';
import { messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';
import { currentUser, isAccount, sessionClient } from '@/lib/supabase/server';

const t = messages.auth;

export const metadata = privateMetadata(t.metaTitle);

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">{t.title}</h1>
        <p className="text-muted">{t.lead}</p>
      </div>
      <Suspense fallback={null}>
        <Login searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Login({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (isAccount(await currentUser(await sessionClient()))) redirect(next);
  const error = params.error === 'link' || params.error === 'unavailable' ? params.error : null;
  return (
    <section className={card}>
      {error ? (
        <p role="alert" className="text-sm text-error-text">
          {t.errors[error]}
        </p>
      ) : null}
      <SignInForm next={next} />
    </section>
  );
}
