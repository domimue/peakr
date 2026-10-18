import Link from 'next/link';

import { messages } from '@/i18n';

export default function Home() {
  const t = messages.home;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-5xl font-bold tracking-tight">{t.title}</h1>
      <p className="max-w-md text-lg opacity-80">{t.tagline}</p>
      <p className="text-sm opacity-60">{t.comingSoon}</p>
      <Link href="/tools" className="font-semibold text-primary hover:underline">
        {t.toolsLink}
      </Link>
    </main>
  );
}
