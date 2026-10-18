import { LegalPage, LegalSection, OperatorAddress } from '@/features/legal/legal-page';
import { interpolate, messages } from '@/i18n';
import { pageMetadata } from '@/lib/metadata';
import { PRIVACY_UPDATED } from '@/lib/site';

const t = messages.legal.privacy;

export const metadata = pageMetadata({
  title: t.metaTitle,
  description: t.metaDescription,
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalPage title={t.title}>
      <p className="text-sm text-muted">{interpolate(t.updated, { date: PRIVACY_UPDATED })}</p>
      <LegalSection heading={t.controllerHeading}>
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
