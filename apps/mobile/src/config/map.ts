import type { ColorScheme } from '@peakr/theme';

/**
 * Map tiles for route maps (CLAUDE.md "Terrain intelligence"): MapTiler's Outdoor style – contour
 * lines, hillshade and paths. The key is a client tile key restricted to the app ids in the
 * MapTiler dashboard (not a secret). `EXPO_PUBLIC_MAP_STYLE_URL` swaps the provider without a
 * code change (e.g. swisstopo or self-hosted tiles). Without either, maps fall back to the
 * tile-less route shape.
 */
export function mapStyleUrl(scheme: ColorScheme): string | null {
  const custom = process.env.EXPO_PUBLIC_MAP_STYLE_URL;
  if (custom) return custom;
  const key = process.env.EXPO_PUBLIC_MAPTILER_KEY;
  if (!key) return null;
  const style = scheme === 'dark' ? 'outdoor-v2-dark' : 'outdoor-v2';
  return `https://api.maptiler.com/maps/${style}/style.json?key=${encodeURIComponent(key)}`;
}
