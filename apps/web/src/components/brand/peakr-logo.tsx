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

interface A11yProps {
  /** Accessible name; omit for decorative use (e.g. next to visible text "peakr"). */
  title?: string;
}

function a11y(title: string | undefined) {
  return title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const };
}

/** Stroke width is in viewBox units, so it scales with the mark (10/120 at every size). */
function MarkLine({ color }: { color: string }) {
  return (
    <polyline
      points={mark.points}
      fill="none"
      stroke={color}
      strokeWidth={markStrokeWidth(mark.viewBox)}
      strokeLinecap={mark.strokeLinecap}
      strokeLinejoin={mark.strokeLinejoin}
    />
  );
}

export interface PeakrMarkProps extends A11yProps {
  /** Width and height in px. */
  size?: number;
  /** Any CSS colour; defaults to `currentColor`. */
  color?: string;
  className?: string;
}

/** "Pulse Peak" mark – exact geometry, stroke always 10/120 of the size. */
export function PeakrMark({ size = 32, color = 'currentColor', className, title }: PeakrMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${mark.viewBox} ${mark.viewBox}`}
      className={className}
      data-logo="mark"
      {...a11y(title)}
    >
      <MarkLine color={color} />
    </svg>
  );
}

export interface PeakrWordmarkProps extends A11yProps {
  /** Height of the outlined "peakr" in px; the width follows the aspect ratio. */
  height?: number;
  color?: string;
  className?: string;
}

/** "peakr" wordmark as outlined paths (Peakr-Display, tracking −0.03em). */
export function PeakrWordmark({
  height = 24,
  color = 'currentColor',
  className,
  title,
}: PeakrWordmarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={wordmarkWidth(height)}
      height={height}
      viewBox={`0 0 ${wordmark.width} ${wordmark.height}`}
      className={className}
      data-logo="wordmark"
      {...a11y(title)}
    >
      <path d={wordmark.path} fill={color} />
    </svg>
  );
}

export interface PeakrLogoProps extends A11yProps {
  variant?: LogoVariant;
  tone: LogoTone;
  /** Height in px (lockup: height of the mark). */
  height?: number;
  className?: string;
}

/** Logo in the brand colours for its background: lockup (mark + wordmark), mark or wordmark alone. */
export function PeakrLogo({
  variant = 'lockup',
  tone,
  height = 32,
  className,
  title = 'peakr',
}: PeakrLogoProps) {
  const fill = logoColors(tone);
  if (variant === 'mark') {
    return <PeakrMark size={height} color={fill.mark} className={className} title={title} />;
  }
  if (variant === 'wordmark') {
    return (
      <PeakrWordmark height={height} color={fill.wordmark} className={className} title={title} />
    );
  }
  const scale = height / lockup.height;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={lockup.width * scale}
      height={height}
      viewBox={`0 0 ${lockup.width} ${lockup.height}`}
      className={className}
      data-logo="lockup"
      {...a11y(title)}
    >
      <g
        transform={`translate(${lockup.mark.x} ${lockup.mark.y}) scale(${lockup.mark.size / mark.viewBox})`}
      >
        <MarkLine color={fill.mark} />
      </g>
      <g
        transform={`translate(${lockup.wordmark.x} ${lockup.wordmark.y}) scale(${lockup.wordmark.scale})`}
      >
        <path d={wordmark.path} fill={fill.wordmark} />
      </g>
    </svg>
  );
}
