import {
  decodePolyline,
  parseGpx,
  type GpxField,
  type GpxPoint,
  type Result,
  type RouteSport,
} from '@peakr/engine';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import type { StoredRoute, StoredStream } from '@/data/repositories/route-repository';
import { routeFromPoints, type RouteDraft } from '@/data/routes/build';

/**
 * Route import (CLAUDE.md "Route sources": own library). GPX files come from the document picker
 * or the share sheet ("Open with Peakr"); recognised routes from the most recent activity on them.
 */

export { routeFromPoints, type RouteDraft } from '@/data/routes/build';

/** Sport hint of a GPX file (`<type>`); runs unless it says cycling. */
export function gpxSport(xml: string): RouteSport {
  const type = /<type>\s*([^<]*)<\/type>/i.exec(xml)?.[1]?.toLowerCase() ?? '';
  return /cycl|bik|ride|velo/.test(type) ? 'bike' : 'run';
}

/** Komoot writes itself into the GPX header (`creator="https://www.komoot.de"`). */
export function isKomootGpx(xml: string): boolean {
  return /<gpx\b[^>]*\bcreator\s*=\s*["'][^"']*komoot/i.test(xml.slice(0, 2000));
}

export function draftFromGpx(xml: string, fallbackName: string): Result<RouteDraft, GpxField> {
  const parsed = parseGpx(xml);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: routeFromPoints(
      parsed.value.points,
      parsed.value.name ?? fallbackName,
      gpxSport(xml),
      isKomootGpx(xml) ? 'komoot' : 'gpx',
    ),
  };
}

export type SharedText = { kind: 'gpx'; xml: string } | { kind: 'komootLink' } | { kind: 'other' };

/**
 * Text shared into Peakr instead of a file: some apps share the GPX itself as text; Komoot's
 * "Share" sends a link, which Peakr never fetches (no scraping) – the user exports the GPX instead.
 */
export function classifySharedText(text: string): SharedText {
  const trimmed = text.trim();
  if (trimmed.startsWith('<') && /<gpx\b/i.test(trimmed)) return { kind: 'gpx', xml: trimmed };
  if (/komoot\.(com|de)\/[^\s]*tour\//i.test(trimmed)) return { kind: 'komootLink' };
  return { kind: 'other' };
}

/** "Morning loop.gpx" → "Morning loop". */
export function nameFromUri(uri: string): string {
  const file = decodeURIComponent(uri.split('/').pop() ?? '');
  return file.replace(/\.gpx$/i, '').trim();
}

export async function readFileText(uri: string): Promise<string> {
  return new File(uri).text();
}

/** Opens the system document picker; null when the user cancels. */
export async function pickGpxFile(): Promise<{ uri: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Many apps send GPX as a generic binary; the parser checks the content.
    type: ['application/gpx+xml', 'application/xml', 'text/xml', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, name: asset.name } : null;
}

/**
 * Track of a recognised route: the stream (with elevation) if it was imported, otherwise the
 * activity's summary polyline without elevation.
 */
export function pointsFromActivity(polyline: string, stream: StoredStream | null): GpxPoint[] {
  if (stream?.latlng) {
    const track = decodePolyline(stream.latlng);
    const alt = stream.data.altitudeM;
    if (track.length === alt.length) return track.map((p, i) => ({ ...p, ele: alt[i] ?? null }));
  }
  return decodePolyline(polyline).map((p) => ({ ...p, ele: null }));
}

/** Gain per km of a stored route (route matching). */
export function gainPerKm(route: Pick<StoredRoute, 'gainM' | 'distanceM'>): number {
  return route.distanceM > 0 ? route.gainM / (route.distanceM / 1000) : 0;
}
