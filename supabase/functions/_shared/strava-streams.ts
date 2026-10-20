/**
 * Strava activity streams → row of `public.activity_streams` (pure, no Deno APIs, so it can be
 * checked with plain Node too, like `strava-map.ts`). Input is the answer of
 * `GET /activities/{id}/streams?keys=distance,altitude,time,heartrate,latlng&key_by_type=true`.
 *
 * Strava sends a point every second or so; the per-km evaluation and route recognition only need
 * the profile, so points are thinned out to ~25 m apart (first and last point always kept).
 */

/** Minimum distance between two kept points. */
export const STREAM_SPACING_M = 25;

interface Stream<T> {
  data?: (T | null)[];
}

/** The streams Peakr asks for, keyed by type (`key_by_type=true`). */
export interface StravaStreams {
  distance?: Stream<number>;
  altitude?: Stream<number>;
  time?: Stream<number>;
  heartrate?: Stream<number>;
  latlng?: Stream<[number, number]>;
}

export interface ActivityStreamRow {
  user_id: string;
  source: 'strava';
  external_id: string;
  distance_m: number[];
  altitude_m: number[];
  time_s: number[] | null;
  heartrate: number[] | null;
  latlng: string | null;
  deleted: false;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Google encoded polyline, precision 5. */
export function encodePolyline(points: [number, number][]): string {
  let out = '';
  let lastLat = 0;
  let lastLng = 0;
  const encode = (value: number): void => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    encode(latE5 - lastLat);
    encode(lngE5 - lastLng);
    lastLat = latE5;
    lastLng = lngE5;
  }
  return out;
}

const validLatLng = (p: unknown): p is [number, number] =>
  Array.isArray(p) && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

/**
 * Downsampled row, or null when the activity has no usable elevation profile (distance or
 * altitude stream missing, or fewer than two valid points).
 */
export function mapStravaStreams(
  userId: string,
  externalId: string,
  streams: StravaStreams,
): ActivityStreamRow | null {
  const distance = streams.distance?.data;
  const altitude = streams.altitude?.data;
  if (!distance || !altitude) return null;
  const length = Math.min(distance.length, altitude.length);
  const sameLength = <T>(data: (T | null)[] | undefined): (T | null)[] | null =>
    data && data.length >= length ? data : null;
  const time = sameLength(streams.time?.data);
  const heartrate = sameLength(streams.heartrate?.data);
  const latlng = sameLength(streams.latlng?.data);

  // Indices with a valid, non-decreasing distance and an altitude.
  const valid: number[] = [];
  let lastDistance = -Infinity;
  for (let i = 0; i < length; i++) {
    const d = distance[i];
    if (!finite(d) || !finite(altitude[i]) || d < lastDistance) continue;
    valid.push(i);
    lastDistance = d;
  }
  if (valid.length < 2) return null;

  const kept: number[] = [valid[0]];
  let keptDistance = distance[valid[0]] as number;
  for (let k = 1; k < valid.length - 1; k++) {
    const d = distance[valid[k]] as number;
    if (d - keptDistance >= STREAM_SPACING_M) {
      kept.push(valid[k]);
      keptDistance = d;
    }
  }
  kept.push(valid[valid.length - 1]);

  const timeOk = time !== null && kept.every((i) => finite(time[i]));
  const hrOk = heartrate !== null && kept.some((i) => finite(heartrate[i]));
  const latlngOk = latlng !== null && kept.every((i) => validLatLng(latlng[i]));

  return {
    user_id: userId,
    source: 'strava',
    external_id: externalId,
    distance_m: kept.map((i) => round1(distance[i] as number)),
    altitude_m: kept.map((i) => round1(altitude[i] as number)),
    time_s: timeOk ? kept.map((i) => Math.round(time[i] as number)) : null,
    // Gaps (strap lost contact) stay 0 so the arrays stay parallel; 0 is never a real heart rate.
    heartrate: hrOk
      ? kept.map((i) => {
          const hr = heartrate[i];
          return finite(hr) && hr >= 20 && hr <= 260 ? Math.round(hr) : 0;
        })
      : null,
    latlng: latlngOk ? encodePolyline(kept.map((i) => latlng[i] as [number, number])) : null,
    deleted: false,
  };
}
