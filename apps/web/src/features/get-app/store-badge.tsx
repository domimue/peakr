import { secondaryButton } from '@/components/ui';
import { messages } from '@/i18n';

import type { StoreBadges } from './stores';

const t = messages.funnel.getApp;

/**
 * One store badge, linked. Both are shown at the same height with the required clear space (a
 * quarter of the badge height) around them; neither is recoloured or resized out of proportion. Without the file: a plain button with the same text. Without a store link
 * (the app is not in that store yet): a disabled "coming soon" button – never a greyed-out badge.
 */
export function StoreBadge({
  store,
  url,
  badges,
}: {
  store: 'googlePlay' | 'appStore';
  url: string | null;
  badges: StoreBadges;
}) {
  const label = store === 'googlePlay' ? t.googlePlay : t.appStore;
  if (!url) {
    return (
      <button type="button" disabled className={secondaryButton}>
        {store === 'googlePlay' ? t.googlePlaySoon : t.appStoreSoon}
      </button>
    );
  }
  const badge = badges[store];
  if (!badge) {
    return (
      <a href={url} className={secondaryButton}>
        {label}
      </a>
    );
  }
  return (
    <a href={url} className="inline-flex p-3">
      {/* Official badge artwork, used unchanged as Google and Apple require. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={badge} alt={label} className="h-12 w-auto" />
    </a>
  );
}
