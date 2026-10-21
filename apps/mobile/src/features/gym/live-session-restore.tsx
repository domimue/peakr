import { useEffect } from 'react';

import { useLiveSessionStore } from './live-session-store';

/** Restores a gym session that was running when the app was killed (once the database is ready). */
export function LiveSessionRestore() {
  const hydrate = useLiveSessionStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return null;
}
