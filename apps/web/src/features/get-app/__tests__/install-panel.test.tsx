import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstallPanel, type InstallPanelProps } from '../install-panel';
import { detectPlatform } from '../platform';

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141 Mobile';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Safari/605.1.15';

describe('detectPlatform', () => {
  it('tells phones and computers apart, including iPads that ask for desktop sites', () => {
    expect(detectPlatform(ANDROID)).toBe('android');
    expect(detectPlatform(IPHONE)).toBe('ios');
    expect(detectPlatform(MAC, 5)).toBe('ios');
    expect(detectPlatform(MAC, 0)).toBe('desktop');
  });
});

function setUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

const props = (patch: Partial<InstallPanelProps> = {}): InstallPanelProps => ({
  variant: 'getApp',
  openUrl: 'https://open.peakr.example/open?from=get_app',
  playUrl: 'https://play.google.com/store/apps/details?id=com.peakr.app',
  appStoreUrl: null,
  badges: { googlePlay: null, appStore: null },
  qr: <div>QR</div>,
  ...patch,
});

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('InstallPanel', () => {
  it('offers "Open Peakr" and Google Play on Android', () => {
    setUserAgent(ANDROID);
    render(<InstallPanel {...props()} />);
    expect(screen.getByRole('link', { name: 'Open Peakr' }).getAttribute('href')).toBe(
      'https://open.peakr.example/open?from=get_app',
    );
    expect(screen.getByRole('link', { name: 'Get it on Google Play' })).toBeDefined();
    expect(screen.queryByText('QR')).toBeNull();
  });

  it('shows both stores and the QR code on a computer, App Store as coming soon', () => {
    setUserAgent(MAC);
    render(<InstallPanel {...props()} />);
    expect(screen.getByText('QR')).toBeDefined();
    expect(screen.getByRole('button', { name: 'App Store – coming soon' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.queryByRole('link', { name: 'Open Peakr' })).toBeNull();
  });

  it('uses the official badge artwork when it is deployed', () => {
    setUserAgent(ANDROID);
    render(
      <InstallPanel
        {...props({ badges: { googlePlay: '/badges/google-play.png', appStore: null } })}
      />,
    );
    expect(screen.getByRole('img', { name: 'Get it on Google Play' }).getAttribute('src')).toBe(
      '/badges/google-play.png',
    );
  });

  it('goes on to Google Play after a moment on the fallback page, once per session', () => {
    vi.useFakeTimers();
    setUserAgent(ANDROID);
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
    const { unmount } = render(<InstallPanel {...props({ variant: 'fallback', openUrl: null })} />);
    expect(screen.getByText('Peakr isn’t on this phone yet')).toBeDefined();
    act(() => vi.advanceTimersByTime(3000));
    expect(assign).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=com.peakr.app',
    );
    unmount();

    assign.mockClear();
    render(<InstallPanel {...props({ variant: 'fallback', openUrl: null })} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(assign).not.toHaveBeenCalled();
  });

  it('lets the visitor stay on the fallback page', async () => {
    setUserAgent(ANDROID);
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
    render(<InstallPanel {...props({ variant: 'fallback' })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('link', { name: 'Already installed? Open Peakr' })).toBeDefined();
    await new Promise((r) => setTimeout(r, 2600));
    expect(assign).not.toHaveBeenCalled();
  }, 10_000);

  it('says the iPhone app is coming soon and does not redirect on iOS before the release', () => {
    vi.useFakeTimers();
    setUserAgent(IPHONE);
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
    render(<InstallPanel {...props({ variant: 'fallback' })} />);
    expect(screen.getByText('The iPhone app is coming soon')).toBeDefined();
    expect(screen.getByRole('button', { name: 'App Store – coming soon' })).toHaveProperty(
      'disabled',
      true,
    );
    act(() => vi.advanceTimersByTime(3000));
    expect(assign).not.toHaveBeenCalled();
  });
});
