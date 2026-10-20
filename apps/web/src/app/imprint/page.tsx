import { LegalPage, LegalSection, OperatorAddress } from '@/features/legal/legal-page';
import { messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';

const t = messages.legal.imprint;

export const metadata = pageMetadata({
  title: t.metaTitle,
  description: t.metaDescription,
  path: '/imprint',
});

export default function ImprintPage() {
  return (
    <LegalPage title={t.title} draft>
      <LegalSection heading={t.operatorHeading}>
        <OperatorAddress />
      </LegalSection>
      <LegalSection heading={t.disclaimerHeading}>
        <p>{t.disclaimer}</p>
      </LegalSection>
    </LegalPage>
  );
}
