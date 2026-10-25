'use client';

import type { ReactNode } from 'react';

import { usePlatform } from './platform';

/**
 * The reusable "Open Peakr" link (header, account, checkout success, Get the app). On a phone it
 * is the app link: Android / iOS open the app when it is installed, otherwise the browser shows
 * the website's /open page with the store. On a computer it leads to Get the app (QR code).
 */
export function OpenAppLink({
  appHref,
  desktopHref = '/get-app',
  className,
  children,
}: {
  appHref: string;
  desktopHref?: string;
  className?: string;
  children: ReactNode;
}) {
  const platform = usePlatform();
  return (
    <a href={platform === 'desktop' ? desktopHref : appHref} className={className}>
      {children}
    </a>
  );
}
