import { siteUrl } from '@/lib/site';

/**
 * Links into the Peakr app (Phase 10d, docs/app-links.md). The app opens every
 * `https://<host>/open/...` URL on a verified host (Android App Links, iOS Universal Links); when it
 * is not installed, the browser loads the website's `/open` page instead, which offers the store.
 *
 * There is no browser API that says whether an app is installed, so nothing here tries to find
 * out: the link either opens the app (decided by the operating system) or it shows the page.
 */

/** Where an "Open Peakr" link sits – carried into the Play Store referrer for attribution. */
export const LINK_PLACEMENTS = [
  'get_app',
  'header',
  'account',
  'checkout',
  'email',
  'qr',
  'banner',
] as const;
export type LinkPlacement = (typeof LINK_PLACEMENTS)[number];

export function placementOf(value: unknown): LinkPlacement {
  return LINK_PLACEMENTS.find((p) => p === value) ?? 'get_app';
}

const stripSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * Origin of app links. A subdomain (e.g. https://open.peakr.ch) in NEXT_PUBLIC_APP_LINK_URL: iOS
 * and Chrome only hand a tapped link to the app when it leads to a different site than the one
 * the visitor is on. Without it the main domain is used, which still works from email and other
 * apps.
 */
export function appLinkOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_LINK_URL;
  return explicit ? stripSlash(explicit) : siteUrl();
}

/** The link host differs from the site, so the site can link to it and the app opens. */
export const hasSeparateLinkHost = () => appLinkOrigin() !== siteUrl();

/** `https://<link host>/open[/<target>]?from=<placement>`; targets as in the app's deep-links. */
export function openAppUrl(
  placement: LinkPlacement,
  target = '',
  origin = appLinkOrigin(),
): string {
  const path = target ? `/open/${target.replace(/^\/+/, '')}` : '/open';
  return `${origin}${path}?from=${placement}`;
}

/**
 * Play Store link with the install referrer (`utm_source`, `utm_medium`, `utm_campaign`), which
 * the app reads from the Play Install Referrer API to attribute the install – never to carry
 * state; the login restores the plan.
 */
export function playStoreUrl(placement: LinkPlacement): string | null {
  const base = process.env.NEXT_PUBLIC_PLAY_STORE_URL;
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  const referrer = new URLSearchParams({
    utm_source: placement === 'email' ? 'email' : 'website',
    utm_medium: placement,
    utm_campaign: 'get_the_app',
  });
  url.searchParams.set('referrer', referrer.toString());
  return url.toString();
}

export function appStoreUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_STORE_URL || null;
}

// ---------------------------------------------------------------------------------------------
// Verification files. Both are served only once configured, so nothing half-filled is published.

const ANDROID_PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * Digital Asset Links for Android App Links. ANDROID_CERT_SHA256 holds every signing certificate
 * fingerprint, comma-separated: the upload key AND the Google Play App Signing key (installs from
 * the store are signed with the latter; without it verification fails for every store user).
 */
export function assetLinks(): unknown[] | null {
  const pkg = process.env.ANDROID_PACKAGE_NAME || 'com.peakr.app';
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter((f) => SHA256_FINGERPRINT.test(f));
  if (!ANDROID_PACKAGE.test(pkg) || fingerprints.length === 0) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: pkg,
        sha256_cert_fingerprints: [...new Set(fingerprints)],
      },
    },
  ];
}

const TEAM_ID = /^[A-Z0-9]{10}$/;
const BUNDLE_ID = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

/** apple-app-site-association for Universal Links: `TeamID.bundleID`, only the /open paths. */
export function appleAppSiteAssociation(): object | null {
  const team = process.env.APPLE_TEAM_ID ?? '';
  const bundle = process.env.IOS_BUNDLE_ID || 'com.peakr.app';
  if (!TEAM_ID.test(team) || !BUNDLE_ID.test(bundle)) return null;
  return {
    applinks: {
      details: [
        {
          appIDs: [`${team}.${bundle}`],
          components: [
            { '/': '/open', comment: 'Open Peakr' },
            { '/': '/open/*', comment: 'A screen in Peakr' },
          ],
        },
      ],
    },
  };
}
