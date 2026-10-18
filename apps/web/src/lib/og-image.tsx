import { ImageResponse } from 'next/og';

import { messages } from '@/i18n';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

// Same zone palette as the app and the calculators (Z1 grey-blue … Z5 red).
const ZONE_COLORS = ['#8fa3b8', '#3e9e5b', '#d9a400', '#ee7d22', '#d7263d'];

/** Branded 1200×630 social card: site name, page title, subtitle and the five zone colours. */
export function renderOgImage({ title, subtitle }: { title: string; subtitle: string }) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#0b0b0d',
        color: '#f4f4f6',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, color: '#ff7a5c' }}>
        {messages.meta.siteName}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>
          {title}
        </div>
        <div style={{ fontSize: 32, color: '#a6a8b2', maxWidth: 1000 }}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {ZONE_COLORS.map((color) => (
          <div key={color} style={{ flex: 1, height: 16, borderRadius: 8, background: color }} />
        ))}
      </div>
    </div>,
    OG_SIZE,
  );
}
