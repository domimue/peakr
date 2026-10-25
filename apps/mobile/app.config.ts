import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Links into the app on our own domain (Phase 10d, docs/app-links.md): Android App Links and iOS
 * Universal Links for every `https://<host>/open/...` URL. The website serves the matching
 * /.well-known/assetlinks.json and /.well-known/apple-app-site-association on each host.
 *
 * APP_LINK_HOSTS (comma-separated, set in eas.json or the EAS environment) overrides the hosts.
 * The second host is the link host the website's "Open Peakr" button points to: iOS and Chrome do
 * not hand a tap to the app when it links to the same site the visitor is on. (vercel.app is a
 * public suffix, so the two vercel.app hosts count as different sites.) Moving to an own domain
 * later means a new build with the new hosts.
 */
const DEFAULT_HOSTS = ['peakr-web.vercel.app', 'peakr-open.vercel.app'];
const LINK_PATH_PREFIX = '/open';

function linkHosts(): string[] {
  const fromEnv = process.env.APP_LINK_HOSTS?.split(',')
    .map((h: string) => h.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_HOSTS;
}

/**
 * EAS profile `personal` (eas.json): everything unlocked without billing, for the owner's own use.
 * Guarded so a production build can never carry it, even if the variable leaks into its env.
 */
const personalBuild =
  process.env.PEAKR_PERSONAL_BUILD === '1' && process.env.EAS_BUILD_PROFILE !== 'production';

export default ({ config }: ConfigContext): ExpoConfig => {
  const hosts = linkHosts();
  const base = config as ExpoConfig;
  return {
    ...base,
    extra: { ...base.extra, personalBuild },
    ios: {
      ...base.ios,
      associatedDomains: hosts.map((host) => `applinks:${host}`),
    },
    android: {
      ...base.android,
      intentFilters: [
        ...(base.android?.intentFilters ?? []),
        {
          action: 'VIEW',
          // Android checks /.well-known/assetlinks.json on every host at install time.
          autoVerify: true,
          category: ['BROWSABLE', 'DEFAULT'],
          data: hosts.map((host) => ({ scheme: 'https', host, pathPrefix: LINK_PATH_PREFIX })),
        },
      ],
    },
  };
};
