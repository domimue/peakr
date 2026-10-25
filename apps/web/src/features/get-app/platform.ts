'use client';

import { useSyncExternalStore } from 'react';

/**
 * Which store fits the visitor's device – only to choose what the page shows (badge, QR code).
 * It says nothing about whether Peakr is installed; no browser can tell that.
 */
export type Platform = 'android' | 'ios' | 'desktop';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  // iPadOS asks for desktop sites and reports itself as a Mac – with a touch screen.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}

const subscribe = () => () => undefined;
const clientPlatform = () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
const serverPlatform = () => null;

/** The visitor's platform; null while rendering on the server (and in the first hydration pass). */
export function usePlatform(): Platform | null {
  return useSyncExternalStore(subscribe, clientPlatform, serverPlatform);
}
