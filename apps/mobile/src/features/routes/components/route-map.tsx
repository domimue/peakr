import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { boundingBox, cumulativeDistances, decodePolyline, type LatLon } from '@peakr/engine';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { mapStyleUrl } from '@/config/map';
import { radius, spacing, useTheme } from '@/ui';

import { RouteShape } from './route-shape';

export interface RouteMapProps {
  /** Encoded polyline of the route. */
  polyline: string;
  color: string;
  height?: number;
  testID?: string;
}

/** The first track point at or after every whole km (km markers). */
function kmMarkers(points: readonly LatLon[]): { km: number; point: LatLon }[] {
  const dist = cumulativeDistances(points);
  const out: { km: number; point: LatLon }[] = [];
  let next = 1000;
  dist.forEach((d, i) => {
    while (d >= next) {
      out.push({ km: next / 1000, point: points[i] as LatLon });
      next += 1000;
    }
  });
  return out;
}

const feature = (kind: string, point: LatLon, label = '') => ({
  type: 'Feature' as const,
  properties: { kind, label },
  geometry: { type: 'Point' as const, coordinates: [point.lon, point.lat] },
});

/**
 * Route on an outdoor map (MapTiler Outdoor via MapLibre): the line in the route colour, start
 * and finish, km markers and the attribution the style requires. Without a configured map style
 * (or on web) the tile-less route shape is shown instead.
 */
export function RouteMap({ polyline, color, height = 220, testID }: RouteMapProps) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const style = Platform.OS === 'web' ? null : mapStyleUrl(scheme);
  const points = useMemo(() => decodePolyline(polyline), [polyline]);
  const geojson = useMemo(() => {
    const ends = [points[0], points.at(-1)];
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { kind: 'route', label: '' },
          geometry: {
            type: 'LineString' as const,
            coordinates: points.map((p) => [p.lon, p.lat]),
          },
        },
        ...kmMarkers(points).map((m) => feature('km', m.point, String(m.km))),
        ...(ends[1] ? [feature('finish', ends[1])] : []),
        ...(ends[0] ? [feature('start', ends[0])] : []),
      ],
    };
  }, [points]);
  const box = boundingBox(points);

  if (!style || !box) {
    return (
      <View style={[styles.frame, { height, backgroundColor: colors.surface2 }]} testID={testID}>
        <RouteShape
          track={points}
          size={Math.min(height - spacing.md * 2, width - spacing.md * 4)}
          color={color}
          markers
          accessibilityLabel={t('routes.mapLabel')}
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.frame, { height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('routes.mapLabel')}
      testID={testID}
    >
      <Map style={StyleSheet.absoluteFill} mapStyle={style} logo={false} compass={false}>
        <Camera
          initialViewState={{
            bounds: [box.minLon, box.minLat, box.maxLon, box.maxLat],
            padding: { top: 32, right: 32, bottom: 32, left: 32 },
          }}
        />
        <GeoJSONSource id="route" data={geojson}>
          <Layer
            id="route-casing"
            type="line"
            filter={['==', ['get', 'kind'], 'route']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': colors.bg, 'line-width': 7 }}
          />
          <Layer
            id="route-line"
            type="line"
            filter={['==', ['get', 'kind'], 'route']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': color, 'line-width': 4 }}
          />
          <Layer
            id="route-km"
            type="circle"
            filter={['==', ['get', 'kind'], 'km']}
            paint={{
              'circle-radius': 8,
              'circle-color': colors.surface,
              'circle-stroke-color': color,
              'circle-stroke-width': 1.5,
            }}
          />
          <Layer
            id="route-km-label"
            type="symbol"
            filter={['==', ['get', 'kind'], 'km']}
            layout={{ 'text-field': ['get', 'label'], 'text-size': 10 }}
            paint={{ 'text-color': colors.text }}
          />
          <Layer
            id="route-ends"
            type="circle"
            filter={['match', ['get', 'kind'], ['start', 'finish'], true, false]}
            paint={{
              'circle-radius': 6,
              'circle-color': ['match', ['get', 'kind'], 'start', color, colors.text],
              'circle-stroke-color': colors.bg,
              'circle-stroke-width': 2,
            }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
