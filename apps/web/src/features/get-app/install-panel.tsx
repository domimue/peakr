'use client';

import type { ReactNode } from 'react';

import { primaryButton, secondaryButton } from '@/components/ui';
import { interpolate, messages } from '@/i18n';

import { usePlatform } from './platform';
import { StoreBadge } from './store-badge';
import { StoreRedirect } from './store-redirect';
import type { StoreBadges } from './stores';

const t = messages.funnel.getApp;

export interface InstallPanelProps {
  /**
   * 'getApp': the Get the app page – "Open Peakr" on a phone. 'fallback': the /open page, which a
   * phone only shows when the app did not open – so it offers the store and goes there shortly.
   */
  variant: 'getApp' | 'fallback';
  /** App link for the "Open Peakr" button (Get the app) or "Already installed?" (fallback). */
  openUrl: string | null;
  playUrl: string | null;
  appStoreUrl: string | null;
  badges: StoreBadges;
  /** QR code (rendered on the server) for visitors on a computer. */
  qr: ReactNode;
}

/** What to install and how, chosen by the visitor's device (see `platform.ts`). */
export function InstallPanel({
  variant,
  openUrl,
  playUrl,
  appStoreUrl,
  badges,
  qr,
}: InstallPanelProps) {
  const platform = usePlatform();
  const play = <StoreBadge store="googlePlay" url={playUrl} badges={badges} />;
  const apple = <StoreBadge store="appStore" url={appStoreUrl} badges={badges} />;

  if (platform === 'android' || platform === 'ios') {
    const storeUrl = platform === 'android' ? playUrl : appStoreUrl;
    const storeName = platform === 'android' ? t.googlePlayName : t.appStoreName;
    if (variant === 'getApp') {
      return (
        <div className="flex flex-col items-start gap-4">
          {openUrl ? (
            <a href={openUrl} className={primaryButton}>
              {t.open}
            </a>
          ) : null}
          <p className="text-sm text-muted">{t.notInstalled}</p>
          {platform === 'android' ? play : apple}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-start gap-4">
        <h2 className="text-xl">{storeUrl ? t.fallbackTitle : t.fallbackSoonTitle}</h2>
        <p className="text-muted">{storeUrl ? t.fallbackLead : t.fallbackSoonLead}</p>
        {platform === 'android' ? play : apple}
        {storeUrl ? (
          <StoreRedirect
            url={storeUrl}
            message={interpolate(t.redirecting, { store: storeName })}
            stayLabel={t.stay}
          />
        ) : null}
        {openUrl ? (
          <a href={openUrl} className={secondaryButton}>
            {t.alreadyInstalled}
          </a>
        ) : null}
      </div>
    );
  }

  // A computer (or not known yet while the page loads): both stores, and the QR code.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {play}
        {apple}
      </div>
      <section
        className={`items-center gap-6 rounded-3xl border border-border p-6 ${platform === 'desktop' ? 'flex' : 'hidden sm:flex'}`}
      >
        {qr}
        <div className="flex flex-col gap-2">
          <h2 className="text-lg">{t.qrTitle}</h2>
          <p className="text-muted">{t.qrLead}</p>
        </div>
      </section>
    </div>
  );
}
