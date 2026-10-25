import Link from 'next/link';

import { secondaryButton } from '@/components/ui';
import { messages } from '@/i18n';
import { privateMetadata } from '@/lib/metadata';

const t = messages.funnel.account.deletedPage;

export const metadata = privateMetadata(t.metaTitle);

/** After the website deletion: confirmation, nothing else to do. */
export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl">{t.title}</h1>
      <p>{t.body}</p>
      <p className="text-muted">{t.subscription}</p>
      <Link href="/" className={`${secondaryButton} self-start`}>
        {t.home}
      </Link>
    </main>
  );
}
