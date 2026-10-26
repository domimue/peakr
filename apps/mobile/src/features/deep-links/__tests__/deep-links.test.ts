import { parseInstallReferrer } from '../install-referrer';
import { savePendingLink, takePendingLink } from '../pending-link';
import { openTarget, parseStoredTarget } from '../targets';

describe('openTarget', () => {
  it('opens Today for the bare link and the listed screens by name', () => {
    expect(openTarget([])).toBe('/today');
    expect(openTarget(['today'])).toBe('/today');
    expect(openTarget(['plan'])).toBe('/plan');
    expect(openTarget(['gym'])).toBe('/gym');
    // Insights is a screen, so the link works whether Body or Insights holds the tab slot.
    expect(openTarget(['insights'])).toBe('/training/insights');
    expect(openTarget(['profile'])).toBe('/profile');
    expect(openTarget(['account'])).toBe('/auth/account');
    expect(openTarget(['subscription'])).toBe('/subscription');
    // A trailing slash gives an empty segment.
    expect(openTarget(['plan', ''])).toBe('/plan');
  });

  it('opens the Body add-on screens, whose guard decides between screen and paywall', () => {
    expect(openTarget(['body'])).toBe('/body/today');
    expect(openTarget(['body-check-in'])).toBe('/body/check-in');
    expect(openTarget(['body-progress'])).toBe('/body/progress');
    expect(parseStoredTarget('/body/progress')).toBe('/body/progress');
  });

  it('opens a workout by id', () => {
    expect(openTarget(['workout', 'w-2026-11-02_run'])).toBe('/training/workout/w-2026-11-02_run');
  });

  it('opens nothing it does not know', () => {
    expect(openTarget(['dev', 'plan'])).toBeNull();
    expect(openTarget(['auth', 'callback'])).toBeNull();
    expect(openTarget(['workout'])).toBeNull();
    expect(openTarget(['workout', '../../dev'])).toBeNull();
    expect(openTarget(['plan', 'extra'])).toBeNull();
    expect(openTarget(['constructor'])).toBeNull();
    expect(openTarget(['toString'])).toBeNull();
  });
});

describe('parseStoredTarget', () => {
  it('accepts only what openTarget produces', () => {
    expect(parseStoredTarget('/plan')).toBe('/plan');
    expect(parseStoredTarget('/training/workout/abc')).toBe('/training/workout/abc');
    expect(parseStoredTarget('/dev/plan')).toBeNull();
    expect(parseStoredTarget('/training/workout/%E0%A4%A')).toBeNull();
    expect(parseStoredTarget(42)).toBeNull();
  });
});

describe('pending link', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  beforeEach(() => store.clear());

  it('is remembered until the sign-in takes it, and both finishing screens get it', () => {
    savePendingLink('/plan', 1_000);
    expect(takePendingLink(2_000)).toBe('/plan');
    expect(takePendingLink(3_000)).toBe('/plan');
    expect(takePendingLink(60_000)).toBeNull();
  });

  it('is not opened after a day', () => {
    savePendingLink('/subscription', 0);
    expect(takePendingLink(25 * 60 * 60 * 1000)).toBeNull();
  });

  it('ignores a tampered value', () => {
    store.set('peakr.pendingLink', JSON.stringify({ target: '/dev/plan', savedAt: 0 }));
    expect(takePendingLink(1)).toBeNull();
    store.set('peakr.pendingLink', '{nope');
    expect(takePendingLink(1)).toBeNull();
  });
});

describe('parseInstallReferrer', () => {
  it('reads the utm parameters the website puts on the Play Store link', () => {
    expect(
      parseInstallReferrer(
        'utm_source=website&utm_medium=checkout&utm_campaign=get_the_app',
        '2026-10-25T10:00:00.000Z',
      ),
    ).toEqual({
      source: 'website',
      medium: 'checkout',
      campaign: 'get_the_app',
      readAt: '2026-10-25T10:00:00.000Z',
    });
    expect(parseInstallReferrer('', 'x')).toMatchObject({ source: null, medium: null });
  });
});
