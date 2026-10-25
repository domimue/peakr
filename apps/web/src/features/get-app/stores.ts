import 'server-only';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The official store badges for "Get the app". Google's and Apple's artwork may not be redrawn,
 * recoloured or squeezed: put the files they provide into `public/badges/` (docs/app-links.md);
 * until then a plain button with the same text is shown.
 */

export interface StoreBadges {
  googlePlay: string | null;
  appStore: string | null;
}

const BADGES = { googlePlay: '/badges/google-play.png', appStore: '/badges/app-store.svg' };

// Read once at start-up: the files are part of the deployment.
const present = (path: string) => existsSync(join(process.cwd(), 'public', path));
const BADGE_FILES: StoreBadges = {
  googlePlay: present(BADGES.googlePlay) ? BADGES.googlePlay : null,
  appStore: present(BADGES.appStore) ? BADGES.appStore : null,
};

export function storeBadges(): StoreBadges {
  return BADGE_FILES;
}
