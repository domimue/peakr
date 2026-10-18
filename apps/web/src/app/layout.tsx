import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { messages } from '@/i18n';
import { siteUrl } from '@/lib/site';

import './globals.css';

// next/font self-hosts the fonts at build time – no requests to Google from visitors.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const t = messages.meta;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: t.title, template: `%s | ${t.siteName}` },
  description: t.description,
  applicationName: t.siteName,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: t.siteName,
    locale: 'en',
    title: t.title,
    description: t.description,
    url: '/',
  },
  twitter: { card: 'summary_large_image', title: t.title, description: t.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div id="content" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
