import { colors, lockup, mark, markStrokeWidth, schemes, wordmark, zoneColors } from '@peakr/theme';
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

const LOCKUP_HEIGHT = 56;

/** Lockup on Ink: mark in Volt, wordmark in white (outlined paths, no font needed). */
function Lockup() {
  const scale = LOCKUP_HEIGHT / lockup.height;
  return (
    <svg
      width={lockup.width * scale}
      height={LOCKUP_HEIGHT}
      viewBox={`0 0 ${lockup.width} ${lockup.height}`}
    >
      <g
        transform={`translate(${lockup.mark.x} ${lockup.mark.y}) scale(${lockup.mark.size / mark.viewBox})`}
      >
        <polyline
          points={mark.points}
          fill="none"
          stroke={colors.volt}
          strokeWidth={markStrokeWidth(mark.viewBox)}
          strokeLinecap={mark.strokeLinecap}
          strokeLinejoin={mark.strokeLinejoin}
        />
      </g>
      <g
        transform={`translate(${lockup.wordmark.x} ${lockup.wordmark.y}) scale(${lockup.wordmark.scale})`}
      >
        <path d={wordmark.path} fill={colors.white} />
      </g>
    </svg>
  );
}

/** Branded 1200×630 social card for tool pages: lockup, page title, subtitle and the five zone colours. */
export function renderOgImage({ title, subtitle }: { title: string; subtitle: string }) {
  const dark = schemes.dark;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: dark.bg,
        color: dark.text,
      }}
    >
      <Lockup />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, maxWidth: 1000 }}>
          {title}
        </div>
        <div style={{ fontSize: 32, color: dark.textMuted, maxWidth: 1000 }}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {zoneColors.dark.map((color) => (
          <div key={color} style={{ flex: 1, height: 16, borderRadius: 8, background: color }} />
        ))}
      </div>
    </div>,
    OG_SIZE,
  );
}
