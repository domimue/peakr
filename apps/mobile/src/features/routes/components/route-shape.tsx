import { decodePolyline, normalizeTrack, type LatLon } from '@peakr/engine';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { useTheme } from '@/ui';

export interface RouteShapeProps {
  /** Encoded polyline or decoded points. */
  track: string | readonly LatLon[];
  size: number;
  color: string;
  /** Start / finish dots (detail views); thumbnails stay plain. */
  markers?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * The route as a normalised line without map tiles: the Progress history thumbnail
 * (CLAUDE.md "UI patterns") and the fallback when no map style is configured.
 */
export function RouteShape({
  track,
  size,
  color,
  markers = false,
  accessibilityLabel,
  testID,
}: RouteShapeProps) {
  const { colors } = useTheme();
  const points = useMemo(() => {
    const decoded = typeof track === 'string' ? decodePolyline(track) : track;
    return normalizeTrack(decoded, size, Math.max(2, size * 0.08));
  }, [track, size]);
  if (points.length < 2) return null;
  const first = points[0] as { x: number; y: number };
  const last = points.at(-1) as { x: number; y: number };
  const stroke = Math.max(1.5, size / 30);
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Svg width={size} height={size}>
        <Polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {markers ? (
          <>
            <Circle cx={last.x} cy={last.y} r={stroke * 1.6} fill={colors.text} />
            <Circle cx={first.x} cy={first.y} r={stroke * 1.6} fill={color} stroke={colors.bg} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
