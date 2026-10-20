import { planConfig } from '../plan/config';
import type { Result } from '../result';
import type { LatLon } from './geo';

/**
 * GPX import (CLAUDE.md "Route sources": own library). A small tokenizer for track points
 * (`trkpt`) and, if a file has no track, route points (`rtept`) – no DOM, so it runs in the app,
 * on the web and in tests alike.
 */

const cfg = planConfig.routes;

export interface GpxPoint extends LatLon {
  /** Elevation in metres, null when the file has none for this point. */
  ele: number | null;
}

export interface GpxTrack {
  /** Name of the track / route, or of the file's metadata; null if the file has none. */
  name: string | null;
  points: GpxPoint[];
}

export type GpxField = 'file';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X'))
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function attribute(tag: string, name: string): number | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(tag);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) && (m[1] as string).trim() !== '' ? value : null;
}

function readPoints(xml: string, tag: 'trkpt' | 'rtept'): GpxPoint[] {
  const points: GpxPoint[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*?)(\\/>|>([\\s\\S]*?)<\\/${tag}>)`, 'g');
  for (const m of xml.matchAll(re)) {
    const lat = attribute(m[1] as string, 'lat');
    const lon = attribute(m[1] as string, 'lon');
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleText = /<ele>\s*([^<]*?)\s*<\/ele>/.exec(m[3] ?? '')?.[1];
    const ele = eleText !== undefined && eleText !== '' ? Number(eleText) : NaN;
    points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
  }
  return points;
}

function readName(xml: string): string | null {
  // Prefer the track / route name over the file's metadata name.
  const scoped = /<(?:trk|rte)\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(xml)?.[1];
  const raw = scoped ?? /<name>([\s\S]*?)<\/name>/.exec(xml)?.[1];
  if (raw === undefined) return null;
  const text = decodeEntities(raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')).trim();
  return text === '' ? null : text.slice(0, 200);
}

export function parseGpx(xml: string): Result<GpxTrack, GpxField> {
  if (xml.trim() === '') return { ok: false, issues: [{ field: 'file', code: 'gpxEmpty' }] };
  if (xml.length > cfg.gpxMaxChars) {
    return { ok: false, issues: [{ field: 'file', code: 'gpxTooLarge' }] };
  }
  let points = readPoints(xml, 'trkpt');
  if (points.length === 0) points = readPoints(xml, 'rtept');
  if (points.length < 2) return { ok: false, issues: [{ field: 'file', code: 'gpxNoPoints' }] };
  if (points.length > cfg.gpxMaxPoints) {
    return { ok: false, issues: [{ field: 'file', code: 'gpxTooLarge' }] };
  }
  return { ok: true, value: { name: readName(xml), points } };
}
