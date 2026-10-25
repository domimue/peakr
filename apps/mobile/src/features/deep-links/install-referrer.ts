import * as Application from 'expo-application';
import { Platform } from 'react-native';

/**
 * Play Install Referrer (Android): where an install came from, e.g. the website's Get the app
 * page (`utm_source=website&utm_medium=checkout&utm_campaign=get_the_app`). Read once after the
 * first start and kept on the device for attribution (Phase 11b sends it with the account). It
 * only attributes – it never carries state; the login restores the plan.
 */

const KEY = 'peakr.installReferrer';

export interface InstallReferrer {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  readAt: string;
}

export function parseInstallReferrer(raw: string, readAt: string): InstallReferrer {
  const params = new URLSearchParams(raw.replace(/^\?/, ''));
  const value = (key: string) => params.get(key)?.slice(0, 100) || null;
  return {
    source: value('utm_source'),
    medium: value('utm_medium'),
    campaign: value('utm_campaign'),
    readAt,
  };
}

export function storedInstallReferrer(): InstallReferrer | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as InstallReferrer) : null;
  } catch {
    return null;
  }
}

/** Reads the referrer once per install; later calls do nothing. Never throws. */
export async function captureInstallReferrer(now = new Date()): Promise<void> {
  const storage = globalThis.localStorage;
  if (Platform.OS !== 'android' || typeof storage === 'undefined') return;
  try {
    if (storage.getItem(KEY) !== null) return;
    const raw = await Application.getInstallReferrerAsync();
    storage.setItem(KEY, JSON.stringify(parseInstallReferrer(raw, now.toISOString())));
  } catch {
    // Not installed from Google Play (sideloaded, dev build) or the service is unavailable.
  }
}
