import type { EditIssue } from '@peakr/engine';
import type { TFunction } from 'i18next';

/** First issue of an engine edit as a message. */
export function issueText(t: TFunction, issues: readonly EditIssue[]): string {
  const code = issues[0]?.code ?? 'generic';
  return t(`plan.errors.${code}` as never, { defaultValue: t('plan.errors.generic') }) as string;
}
