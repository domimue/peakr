import {
  LegalPage,
  LegalSection,
  LegalUpdated,
  OperatorAddress,
} from '@/features/legal/legal-page';
import { messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';
import { TERMS_UPDATED } from '@/lib/site';

const t = messages.legal.terms;

export const metadata = pageMetadata({
  title: t.metaTitle,
  description: t.metaDescription,
  path: '/terms',
});

export default function TermsPage() {
  return (
    <LegalPage title={t.title} draft>
      <LegalUpdated date={TERMS_UPDATED} />
      <LegalSection heading={t.providerHeading}>
        <OperatorAddress />
      </LegalSection>
      {t.sections.map((section) => (
        <LegalSection key={section.heading} heading={section.heading}>
          <p>{section.body}</p>
        </LegalSection>
      ))}
    </LegalPage>
  );
}
