import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { card, secondaryButton, textInput } from '@/components/ui';
import { deleteAccount } from '@/features/account/delete-action';
import { DELETE_CONFIRMATION } from '@/features/account/deletion';
import { interpolate, messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';
import { currentUser, isAccount, sessionClient } from '@/lib/supabase/server';

const t = messages.funnel.account.deletePage;
const items = messages.deleteAccount.deletedItems;

export const metadata = privateMetadata(t.metaTitle);

const dangerButton =
  'inline-flex min-h-12 items-center justify-center rounded-button bg-error px-6 font-semibold ' +
  'text-on-accent transition-opacity hover:opacity-90';

export default function DeleteAccountRequestPage({ searchParams }: PageProps<'/account/delete'>) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl">{t.title}</h1>
      <Suspense fallback={null}>
        <DeleteForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** Signed in only: what is deleted, the subscription note, the typed confirmation. */
async function DeleteForm({ searchParams }: Pick<PageProps<'/account/delete'>, 'searchParams'>) {
  const params = await searchParams;
  const user = await currentUser(await sessionClient());
  if (!isAccount(user)) redirect('/login?next=/account/delete');

  return (
    <>
      <p className="text-muted">{interpolate(t.lead, { email: user.email ?? '' })}</p>
      <section className={card}>
        <h2 className="text-lg">{messages.deleteAccount.deletedHeading}</h2>
        <ul className="list-disc space-y-1 pl-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2 className="text-lg">{t.subscriptionHeading}</h2>
        <p>{t.subscriptionBody}</p>
      </section>
      <form action={deleteAccount} className={card}>
        <label htmlFor="confirm" className="font-semibold">
          {interpolate(t.confirmLabel, { word: DELETE_CONFIRMATION })}
        </label>
        <input
          id="confirm"
          name="confirm"
          className={textInput}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          aria-invalid={params.error === 'confirm' ? true : undefined}
        />
        {params.error ? (
          <p role="alert" className="text-sm text-error-text">
            {params.error === 'confirm'
              ? interpolate(t.errorConfirm, { word: DELETE_CONFIRMATION })
              : t.errorFailed}
          </p>
        ) : null}
        <button type="submit" className={dangerButton}>
          {t.submit}
        </button>
        <Link href="/account" className={secondaryButton}>
          {t.cancel}
        </Link>
      </form>
    </>
  );
}
