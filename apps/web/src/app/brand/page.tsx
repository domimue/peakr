import { fontSizes } from '@peakr/theme';
import type { Metadata } from 'next';

import { PeakrLogo, PeakrMark, PeakrWordmark } from '@/components/brand/peakr-logo';
import { interpolate, messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';

const t = messages.brand;

export const metadata: Metadata = {
  ...pageMetadata({ title: t.metaTitle, description: t.metaDescription, path: '/brand' }),
  // Internal reference page: reachable, but not indexed and not in the sitemap.
  robots: { index: false, follow: false },
};

// Full class names so Tailwind can see them at build time.
const SWATCHES = [
  ['background', 'bg-background'],
  ['surface', 'bg-surface'],
  ['surface-2', 'bg-surface-2'],
  ['border', 'bg-border'],
  ['foreground', 'bg-foreground'],
  ['muted', 'bg-muted'],
  ['accent', 'bg-accent'],
  ['error', 'bg-error'],
  ['warning', 'bg-warning'],
  ['info', 'bg-info'],
] as const;

const ZONES = [
  [1, 'bg-zone-1'],
  [2, 'bg-zone-2'],
  [3, 'bg-zone-3'],
  [4, 'bg-zone-4'],
  [5, 'bg-zone-5'],
] as const;

const TYPE_SCALE = [
  ['text-3xl', fontSizes.display, true],
  ['text-2xl', fontSizes.xxl, true],
  ['text-xl', fontSizes.xl, true],
  ['text-lg', fontSizes.lg, true],
  ['text-base', fontSizes.md, false],
  ['text-sm', fontSizes.sm, false],
  ['text-xs', fontSizes.xs, false],
] as const;

function Palette() {
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-5 gap-2">
        {SWATCHES.map(([name, className]) => (
          <li key={name} className="flex flex-col gap-1">
            <span className={`h-10 rounded-lg border border-border ${className}`} />
            <span className="truncate text-xs text-muted">{name}</span>
          </li>
        ))}
      </ul>
      <ul className="flex gap-2" aria-label={t.zones}>
        {ZONES.map(([zone, className]) => (
          <li key={zone} className="flex flex-1 flex-col items-center gap-1">
            <span className={`h-8 w-full rounded-md ${className}`} />
            <span className="text-sm font-medium">
              {interpolate(messages.zones.label, { zone })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BrandPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl">{t.title}</h1>
        <p className="text-lg text-muted">{t.lead}</p>
      </header>

      <section aria-labelledby="logo" className="flex flex-col gap-4">
        <h2 id="logo" className="text-xl">
          {t.logo}
        </h2>
        <div className="theme-dark flex flex-col gap-6 rounded-3xl bg-background p-6 text-foreground">
          <p className="text-sm text-muted">{t.onDark}</p>
          <PeakrLogo tone="onDark" height={64} />
          <div className="flex flex-wrap items-center gap-8">
            <PeakrLogo variant="mark" tone="onDark" height={48} />
            <PeakrLogo variant="wordmark" tone="onDark" height={32} />
          </div>
        </div>
        <div className="flex flex-col gap-6 rounded-3xl border border-border bg-background p-6">
          <p className="text-sm text-muted">{t.onLight}</p>
          <PeakrLogo tone="onLight" height={64} />
        </div>
        <div className="flex flex-col gap-6 rounded-3xl bg-volt p-6 text-ink">
          <p className="text-sm">{t.onAccent}</p>
          <div className="flex flex-wrap items-center gap-8">
            <PeakrMark size={48} />
            <PeakrWordmark height={32} />
          </div>
        </div>
      </section>

      <section aria-labelledby="colors" className="flex flex-col gap-4">
        <h2 id="colors" className="text-xl">
          {t.colors}
        </h2>
        <p className="text-muted">{t.zonesNote}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-3xl border border-border bg-background p-5">
            <h3 className="text-lg">{t.light}</h3>
            <Palette />
          </div>
          <div className="theme-dark flex flex-col gap-3 rounded-3xl bg-background p-5 text-foreground">
            <h3 className="text-lg">{t.dark}</h3>
            <Palette />
          </div>
        </div>
      </section>

      <section aria-labelledby="type" className="flex flex-col gap-4">
        <h2 id="type" className="text-xl">
          {t.type}
        </h2>
        <ul className="flex flex-col gap-2">
          {TYPE_SCALE.map(([className, size, display]) => (
            <li
              key={className}
              className={`${className} ${display ? 'font-display tracking-[-0.02em]' : ''}`}
            >
              peakr {size}
            </li>
          ))}
        </ul>
        <p className="tabular-nums">{t.numbers}</p>
      </section>

      <section aria-labelledby="buttons" className="flex flex-col gap-4">
        <h2 id="buttons" className="text-xl">
          {t.buttons}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-12 rounded-button bg-accent px-6 font-semibold text-on-accent hover:bg-accent-pressed"
          >
            {t.primary}
          </button>
          <button
            type="button"
            className="min-h-12 rounded-button border-1.5 border-border px-6 font-semibold hover:bg-surface"
          >
            {t.secondary}
          </button>
        </div>
      </section>
    </main>
  );
}
