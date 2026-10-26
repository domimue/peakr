import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { todayIso } from '@/data/ids';
import { useEntitlement } from '@/features/billing/billing-store';
import { Button, Card, ListState, Screen, SegmentedControl, spacing, Text } from '@/ui';

import { CheckInSection } from '../components/check-in-section';
import { DiarySection } from '../components/diary-section';
import { HealthLinkCard } from '../components/health-link-card';
import { BodyLockedPreview } from '../components/locked-preview';
import { ProfileSetupCard } from '../components/profile-setup-card';
import { ProgressSection } from '../components/progress-section';
import { SampleDiary } from '../components/sample';
import { exportBodyData } from '../export';
import { useBodyProfile } from '../profile';

export type BodySection = 'today' | 'checkIn' | 'progress';

/**
 * The Body tab (CLAUDE.md "Add-on rules"): Today (food diary with "Energy today"), Check-in and
 * Progress (dashboard + coach), all inside Peakr's own navigation. Locked: a blurred sample and
 * the way to the paywall. Expired: the history stays readable and exportable, new entries are
 * locked, and reactivating restores everything (nothing was deleted).
 */
export function BodyScreen({
  initial = 'today',
  title = true,
}: {
  initial?: BodySection;
  /** False inside a stack screen that has its own header. */
  title?: boolean;
}) {
  const { t } = useTranslation();
  const guard = useEntitlement('body_nutrition');
  const profile = useBodyProfile();
  const [section, setSection] = useState<BodySection>(initial);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const screenTitle = title ? t('bodyAddon.title') : undefined;

  if (!guard.visible) return <Redirect href="/today" />;
  if (!guard.canRead) {
    return (
      <Screen title={screenTitle}>
        <Text tone="secondary">{t('bodyAddon.tagline')}</Text>
        <BodyLockedPreview guard={guard} sample={<SampleDiary />} />
      </Screen>
    );
  }

  const doExport = async () => {
    const result = await exportBodyData(todayIso());
    setExportMessage(result === 'shared' ? null : t('bodyAddon.export.failed'));
  };

  return (
    <Screen title={screenTitle}>
      {guard.state === 'expired' ? (
        <Card style={styles.card} testID="body-read-only">
          <Text variant="heading">{t('bodyAddon.readOnly.title')}</Text>
          <Text tone="secondary">{t('bodyAddon.readOnly.body')}</Text>
          <Button
            label={t('bodyAddon.readOnly.reactivate')}
            onPress={() => router.push('/body/addon')}
          />
        </Card>
      ) : null}
      {guard.isTrial ? (
        <Text variant="caption" tone="secondary">
          {t('bodyAddon.trialActive')}
        </Text>
      ) : null}

      {profile.isPending ? (
        <ListState kind="loading" label={t('common.loading')} />
      ) : profile.data && profile.data.missing.length > 0 && guard.canWrite ? (
        <ProfileSetupCard state={profile.data} />
      ) : null}

      {guard.canWrite ? <HealthLinkCard /> : null}

      <SegmentedControl
        options={[
          { value: 'today', label: t('bodyAddon.sections.today') },
          { value: 'checkIn', label: t('bodyAddon.sections.checkIn') },
          { value: 'progress', label: t('bodyAddon.sections.progress') },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === 'today' ? (
        <DiarySection guard={guard} />
      ) : section === 'checkIn' ? (
        <CheckInSection guard={guard} />
      ) : (
        <ProgressSection guard={guard} />
      )}

      <Button
        variant="secondary"
        icon="upload"
        label={t('bodyAddon.export.action')}
        onPress={() => void doExport()}
      />
      {exportMessage ? <Text tone="secondary">{exportMessage}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
});
