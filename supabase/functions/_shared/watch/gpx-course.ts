import type { WatchRoute } from './model.ts';

/**
 * A route as a GPX 1.1 file with one `<trk>`. Garmin Connect, COROS, Suunto and most other
 * platforms import it as a course. Pure string building (no XML library) so it runs on the device
 * and in Edge Functions; names are escaped.
 */

const escapeXml = (text: string): string =>
  text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

const coordinate = (n: number): string => n.toFixed(6);

export function routeToGpx(route: WatchRoute, now: Date = new Date()): string {
  const points = route.points
    .map(
      (p) =>
        `<trkpt lat="${coordinate(p.lat)}" lon="${coordinate(p.lon)}">` +
        (p.ele !== null ? `<ele>${p.ele.toFixed(1)}</ele>` : '') +
        '</trkpt>',
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<gpx version="1.1" creator="Peakr" xmlns="http://www.topografix.com/GPX/1/1">' +
    `<metadata><name>${escapeXml(route.name)}</name><time>${now.toISOString()}</time></metadata>` +
    `<trk><name>${escapeXml(route.name)}</name><type>${route.sport === 'run' ? 'running' : 'cycling'}</type>` +
    `<trkseg>${points}</trkseg></trk></gpx>`
  );
}
