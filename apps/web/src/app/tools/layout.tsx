import Link from 'next/link';

import { messages } from '@/i18n';

export default function ToolsLayout({ children }: LayoutProps<'/tools'>) {
  return (
    <>
      <nav aria-label={messages.nav.label} className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            {messages.nav.home}
          </Link>
          <Link href="/tools" className="text-sm font-medium text-muted hover:text-foreground">
            {messages.nav.tools}
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
