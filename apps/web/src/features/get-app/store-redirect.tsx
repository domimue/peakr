'use client';

import { useEffect, useState } from 'react';

import { secondaryButton } from '@/components/ui';

const DELAY_MS = 2500;
const KEY = 'peakr.storeRedirected';

function alreadyRedirected(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    // Storage blocked: redirect anyway, the visitor can still come back.
    return false;
  }
}

/**
 * On the /open fallback page (the app did not open, so it is most likely not installed): goes on
 * to the store after a short moment, with a way to stay. Only once per browser session, so coming
 * back from the store does not bounce the visitor there again.
 */
export function StoreRedirect({
  url,
  message,
  stayLabel,
}: {
  url: string;
  message: string;
  stayLabel: string;
}) {
  // Rendered only in the browser (it depends on the detected platform), so storage is there.
  const [active, setActive] = useState(() => !alreadyRedirected());

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(KEY, '1');
      } catch {
        // Storage blocked: see `alreadyRedirected`.
      }
      window.location.assign(url);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, url]);

  if (!active) return null;
  return (
    <div className="flex flex-col items-start gap-3" role="status">
      <p className="text-muted">{message}</p>
      <button type="button" className={secondaryButton} onClick={() => setActive(false)}>
        {stayLabel}
      </button>
    </div>
  );
}
