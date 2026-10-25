import { messages } from '@/i18n';

import { appStoreUrl, openAppUrl, playStoreUrl, type LinkPlacement } from './app-links';
import { InstallPanel } from './install-panel';
import { QrCode } from './qr-code';
import { storeBadges } from './stores';

/**
 * Server half of the install panel: store links with the referrer of this placement, the badges
 * that are deployed and the QR code (which is itself an app link – scanned with a phone that has
 * Peakr, it opens the app).
 */
export function InstallSection({
  variant,
  placement,
  openUrl,
}: {
  variant: 'getApp' | 'fallback';
  placement: LinkPlacement;
  openUrl: string | null;
}) {
  return (
    <InstallPanel
      variant={variant}
      openUrl={openUrl}
      playUrl={playStoreUrl(placement)}
      appStoreUrl={appStoreUrl()}
      badges={storeBadges()}
      qr={<QrCode value={openAppUrl('qr')} label={messages.funnel.getApp.qrAlt} />}
    />
  );
}
