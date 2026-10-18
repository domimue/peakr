import {
  lockup,
  logoColors,
  mark,
  markStrokeWidth,
  wordmark,
  wordmarkWidth,
  type LogoTone,
  type LogoVariant,
} from '@peakr/theme';
import Svg, { G, Path, Polyline } from 'react-native-svg';

export interface PeakrMarkProps {
  /** Width and height in dp. */
  size?: number;
  color: string;
  accessibilityLabel?: string;
}

/** "Pulse Peak" mark – exact geometry, stroke always 10/120 of the size. */
export function PeakrMark({ size = 32, color, accessibilityLabel }: PeakrMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${mark.viewBox} ${mark.viewBox}`}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      testID="peakr-mark"
    >
      <MarkLine color={color} />
    </Svg>
  );
}

/** Stroke width is in viewBox units, so it scales with the mark (10/120 at every size). */
function MarkLine({ color }: { color: string }) {
  return (
    <Polyline
      points={mark.points}
      fill="none"
      stroke={color}
      strokeWidth={markStrokeWidth(mark.viewBox)}
      strokeLinecap={mark.strokeLinecap}
      strokeLinejoin={mark.strokeLinejoin}
    />
  );
}

export interface PeakrWordmarkProps {
  /** Height of the outlined "peakr" in dp; the width follows the aspect ratio. */
  height?: number;
  color: string;
  accessibilityLabel?: string;
}

/** "peakr" wordmark as outlined paths (Peakr-Display, tracking −0.03em). */
export function PeakrWordmark({ height = 24, color, accessibilityLabel }: PeakrWordmarkProps) {
  return (
    <Svg
      width={wordmarkWidth(height)}
      height={height}
      viewBox={`0 0 ${wordmark.width} ${wordmark.height}`}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      testID="peakr-wordmark"
    >
      <Path d={wordmark.path} fill={color} />
    </Svg>
  );
}

export interface PeakrLogoProps {
  variant?: LogoVariant;
  tone: LogoTone;
  /** Height in dp (lockup: height of the mark). */
  height?: number;
  accessibilityLabel?: string;
}

/** Logo in the brand colours for its background: lockup (mark + wordmark), mark or wordmark alone. */
export function PeakrLogo({
  variant = 'lockup',
  tone,
  height = 32,
  accessibilityLabel = 'peakr',
}: PeakrLogoProps) {
  const fill = logoColors(tone);
  if (variant === 'mark') {
    return <PeakrMark size={height} color={fill.mark} accessibilityLabel={accessibilityLabel} />;
  }
  if (variant === 'wordmark') {
    return (
      <PeakrWordmark
        height={height}
        color={fill.wordmark}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }
  const scale = height / lockup.height;
  const markScale = lockup.mark.size / mark.viewBox;
  return (
    <Svg
      width={lockup.width * scale}
      height={height}
      viewBox={`0 0 ${lockup.width} ${lockup.height}`}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="peakr-lockup"
    >
      <G transform={`translate(${lockup.mark.x} ${lockup.mark.y}) scale(${markScale})`}>
        <MarkLine color={fill.mark} />
      </G>
      <G
        transform={`translate(${lockup.wordmark.x} ${lockup.wordmark.y}) scale(${lockup.wordmark.scale})`}
      >
        <Path d={wordmark.path} fill={fill.wordmark} />
      </G>
    </Svg>
  );
}
