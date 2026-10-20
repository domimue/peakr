import { PricingPlans } from '@/features/pricing/pricing-plans';
import { QuizCta } from '@/features/tools/tool-page';
import { messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';

const t = messages.pricing;

export const metadata = pageMetadata({
  title: t.metaTitle,
  description: t.metaDescription,
  path: '/pricing',
});

/** FAQ as schema.org structured data for search results. */
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: t.faq.items.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
};

export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-14 px-4 py-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-2xl sm:text-3xl">{t.title}</h1>
        <p className="max-w-2xl text-lg text-muted">{t.lead}</p>
      </header>

      <PricingPlans />

      <section aria-labelledby="trial" className="flex flex-col gap-6">
        <h2 id="trial" className="text-xl">
          {t.trial.title}
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {t.trial.items.map((item, index) => (
            <li key={item.title} className="flex gap-4 rounded-2xl bg-surface p-5">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background font-semibold tabular-nums"
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="leading-relaxed text-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq" className="flex flex-col gap-6">
        <h2 id="faq" className="text-xl">
          {t.faq.title}
        </h2>
        <dl className="flex flex-col divide-y divide-border border-y border-border">
          {t.faq.items.map((item) => (
            <div key={item.question} className="flex flex-col gap-2 py-5">
              <dt className="font-semibold">{item.question}</dt>
              <dd className="leading-relaxed text-muted">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <QuizCta title={t.cta.title} body={t.cta.body} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\u003c') }}
      />
    </main>
  );
}
