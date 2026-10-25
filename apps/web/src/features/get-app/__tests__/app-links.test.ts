import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as aasaRoute } from '@/app/.well-known/apple-app-site-association/route';
import { GET as assetLinksRoute } from '@/app/.well-known/assetlinks.json/route';

import {
  appleAppSiteAssociation,
  appLinkOrigin,
  assetLinks,
  openAppUrl,
  placementOf,
  playStoreUrl,
} from '../app-links';

const UPLOAD =
  '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5';
const PLAY =
  'fa:c6:17:45:dc:09:03:78:6f:b9:ed:e6:2a:96:2b:39:9f:73:48:f0:bb:6f:89:9b:83:32:66:75:91:03:3b:9c';

afterEach(() => vi.unstubAllEnvs());

describe('assetlinks.json', () => {
  it('lists the package with both signing certificates, upper-cased and de-duplicated', () => {
    vi.stubEnv('ANDROID_CERT_SHA256', `${UPLOAD}, ${PLAY}, ${UPLOAD.toLowerCase()}`);
    expect(assetLinks()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.peakr.app',
          sha256_cert_fingerprints: [UPLOAD, PLAY.toUpperCase()],
        },
      },
    ]);
  });

  it('is not served until a valid fingerprint is configured', async () => {
    vi.stubEnv('ANDROID_CERT_SHA256', 'not-a-fingerprint');
    expect(assetLinks()).toBeNull();
    expect(assetLinksRoute().status).toBe(404);
  });

  it('is served as JSON with status 200', async () => {
    vi.stubEnv('ANDROID_CERT_SHA256', PLAY);
    const response = assetLinksRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toHaveLength(1);
  });
});

describe('apple-app-site-association', () => {
  it('names TeamID.bundleID and only the /open paths', async () => {
    vi.stubEnv('APPLE_TEAM_ID', 'ABCDE12345');
    expect(appleAppSiteAssociation()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['ABCDE12345.com.peakr.app'],
            components: [
              { '/': '/open', comment: 'Open Peakr' },
              { '/': '/open/*', comment: 'A screen in Peakr' },
            ],
          },
        ],
      },
    });
    const response = aasaRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('is not served without a valid team id', () => {
    vi.stubEnv('APPLE_TEAM_ID', 'abc');
    expect(appleAppSiteAssociation()).toBeNull();
    expect(aasaRoute().status).toBe(404);
  });
});

describe('app links', () => {
  it('use the link subdomain when configured, else the site', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://peakr.example');
    expect(appLinkOrigin()).toBe('https://peakr.example');
    vi.stubEnv('NEXT_PUBLIC_APP_LINK_URL', 'https://open.peakr.example/');
    expect(appLinkOrigin()).toBe('https://open.peakr.example');
    expect(openAppUrl('header')).toBe('https://open.peakr.example/open?from=header');
    expect(openAppUrl('email', 'workout/w1')).toBe(
      'https://open.peakr.example/open/workout/w1?from=email',
    );
  });

  it('accept only known placements', () => {
    expect(placementOf('account')).toBe('account');
    expect(placementOf('<script>')).toBe('get_app');
    expect(placementOf(undefined)).toBe('get_app');
  });
});

describe('Play Store link', () => {
  it('carries the install referrer', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_PLAY_STORE_URL',
      'https://play.google.com/store/apps/details?id=com.peakr.app',
    );
    const url = new URL(playStoreUrl('checkout') as string);
    expect(url.searchParams.get('id')).toBe('com.peakr.app');
    expect(
      Object.fromEntries(new URLSearchParams(url.searchParams.get('referrer') as string)),
    ).toEqual({ utm_source: 'website', utm_medium: 'checkout', utm_campaign: 'get_the_app' });
    expect(
      new URLSearchParams(
        new URL(playStoreUrl('email') as string).searchParams.get('referrer') as string,
      ).get('utm_source'),
    ).toBe('email');
  });

  it('is missing until the app is in the store', () => {
    vi.stubEnv('NEXT_PUBLIC_PLAY_STORE_URL', '');
    expect(playStoreUrl('header')).toBeNull();
  });
});
