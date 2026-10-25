import Link from 'next/link';

import { LegalPage, LegalSection } from '@/features/legal/legal-page';
import { messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';

const t = messages.deleteAccount;
const operatorEmail = messages.legal.operator.email;

/** The stores' own subscription management pages (deep links into the store apps on mobile). */
const GOOGLE_PLAY_SUBSCRIPTIONS = 'https://play.google.com/store/account/subscriptions';
const APP_STORE_SUBSCRIPTIONS = 'https://apps.apple.com/account/subscriptions';

export const metadata = pageMetadata({
  title: t.metaTitle,
  description: t.metaDescription,
  path: '/delete-account',
});

const linkClass = 'font-semibold text-foreground underline underline-offset-2';

/** Public account deletion page – Google Play requires a web link to it. */
export default function DeleteAccountPage() {
  // The address is rendered as a mailto link inside the sentence.
  const [emailBefore, emailAfter] = t.emailBody.split('{{email}}');
  return (
    <LegalPage title={t.title}>
      <p className="text-lg leading-relaxed text-muted">{t.lead}</p>
      <LegalSection heading={t.inAppHeading}>
        <ol className="list-decimal space-y-1 pl-5">
          {t.inAppSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </LegalSection>
      <LegalSection heading={t.webHeading}>
        <p>{t.webBody}</p>
        <p className="mt-2">
          <Link href="/account/delete" className={linkClass}>
            {t.webLink}
          </Link>
        </p>
      </LegalSection>
      <LegalSection heading={t.emailHeading}>
        <p>
          {emailBefore}
          <a href={`mailto:${operatorEmail}`} className={linkClass}>
            {operatorEmail}
          </a>
          {emailAfter}
        </p>
      </LegalSection>
      <LegalSection heading={t.deletedHeading}>
        <ul className="list-disc space-y-1 pl-5">
          {t.deletedItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </LegalSection>
      <LegalSection heading={t.keptHeading}>
        <p>{t.keptBody}</p>
      </LegalSection>
      <LegalSection heading={t.timeframeHeading}>
        <p>{t.timeframeBody}</p>
      </LegalSection>
      <LegalSection heading={t.subscriptionHeading}>
        <p>{t.subscriptionBody}</p>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            {t.subscriptionStores.googlePlay}
            <br />
            <a href={GOOGLE_PLAY_SUBSCRIPTIONS} className={linkClass}>
              {t.googlePlayLink}
            </a>
          </li>
          <li>
            {t.subscriptionStores.appStore}
            <br />
            <a href={APP_STORE_SUBSCRIPTIONS} className={linkClass}>
              {t.appStoreLink}
            </a>
          </li>
          <li>{t.subscriptionStores.web}</li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
