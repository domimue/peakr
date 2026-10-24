import 'server-only';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Store links and badges for "Get the app". The links come from the environment, so nothing points
 * to a store page before the app is published there. The official badge artwork (Google Play,
 * Apple) may not be redrawn: put the files Google and Apple provide into `public/badges/` (see
 * docs/web-checkout-setup.md); until then a plain button with the same text is shown.
 */

export interface StoreLink {
  store: 'googlePlay' | 'appStore';
  url: string;
  /** Public path of the official badge, if the file is there. */
  badge: string | null;
}

const BADGES = { googlePlay: '/badges/google-play.png', appStore: '/badges/app-store.svg' };

// Read once at start-up: the files are part of the deployment.
const present = (path: string) => existsSync(join(process.cwd(), 'public', path));
const BADGE_FILES = {
  googlePlay: present(BADGES.googlePlay) ? BADGES.googlePlay : null,
  appStore: present(BADGES.appStore) ? BADGES.appStore : null,
};

export function storeLinks(): StoreLink[] {
  const links: StoreLink[] = [];
  const play = process.env.NEXT_PUBLIC_PLAY_STORE_URL;
  const apple = process.env.NEXT_PUBLIC_APP_STORE_URL;
  if (play) links.push({ store: 'googlePlay', url: play, badge: BADGE_FILES.googlePlay });
  if (apple) links.push({ store: 'appStore', url: apple, badge: BADGE_FILES.appStore });
  return links;
}
