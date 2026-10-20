import { QuizCta } from '@/features/tools/tool-page';
import { messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';

const t = messages.features;
const s = t.sections;

export const metadata = pageMetadata({
  title: t.metaTitle,
  description: t.metaDescription,
  path: '/features',
});

/** Stands in for the app screenshot until real ones exist. */
function ScreenshotPlaceholder() {
  return (
    <div
      role="img"
      aria-label={t.imagePlaceholder}
      className="flex aspect-[4/3] w-full items-center justify-center rounded-3xl border border-dashed border-border bg-surface-2 p-6 text-center text-sm text-muted"
    >
      {t.imagePlaceholder}
    </div>
  );
}

function FeatureSection({
  id,
  title,
  body,
  points,
  badge,
  reversed = false,
}: {
  id: string;
  title: string;
  body: string;
  points: readonly string[];
  badge?: string;
  reversed?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-6 gap-8 md:grid-cols-2 md:items-center"
    >
      <div className={`flex flex-col gap-4 ${reversed ? 'md:order-2' : ''}`}>
        {badge ? (
          <span className="w-fit rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold">
            {badge}
          </span>
        ) : null}
        <h2 id={`${id}-title`} className="text-xl">
          {title}
        </h2>
        <p className="text-lg leading-relaxed text-muted">{body}</p>
        <ul className="flex flex-col gap-2">
          {points.map((point) => (
            <li key={point} className="flex gap-2 leading-relaxed">
              <span aria-hidden="true" className="font-semibold text-accent-line">
                ✓
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <ScreenshotPlaceholder />
    </section>
  );
}

function IntegrationList({ label, items }: { label: string; items: readonly IntegrationItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.name} className="flex flex-col gap-1 rounded-2xl bg-surface p-5">
            <span className="font-semibold">{item.name}</span>
            <span className="text-sm text-muted">{item.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type IntegrationItem = (typeof s.integrations.now)[number];

export default function FeaturesPage() {
  return (
    <main className="flex flex-col">
      <div className="theme-dark bg-background text-foreground">
        <header className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-12 sm:py-16">
          <h1 className="max-w-3xl text-2xl leading-tight sm:text-3xl">{t.title}</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">{t.lead}</p>
        </header>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-14">
        <FeatureSection id="hybrid" {...s.hybrid} />
        <FeatureSection id="heart-rate" {...s.heartRate} reversed />
        <FeatureSection id="terrain" {...s.terrain} />
        <FeatureSection id="real-life" {...s.realLife} reversed />

        <section
          id="integrations"
          aria-labelledby="integrations-title"
          className="flex scroll-mt-6 flex-col gap-6"
        >
          <div className="flex flex-col gap-3">
            <h2 id="integrations-title" className="text-xl">
              {s.integrations.title}
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted">{s.integrations.body}</p>
          </div>
          <IntegrationList label={s.integrations.nowLabel} items={s.integrations.now} />
          <IntegrationList label={s.integrations.laterLabel} items={s.integrations.later} />
        </section>

        <FeatureSection id="nutrition" {...s.nutrition} badge={t.comingSoon} reversed />

        <QuizCta title={t.cta.title} body={t.cta.body} />
      </div>
    </main>
  );
}
