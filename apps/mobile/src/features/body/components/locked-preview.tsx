import { BlurTargetView, BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { AddonGuard } from '@/features/billing/model';
import { Badge, Button, Card, ListState, spacing, Text, useTheme } from '@/ui';

/**
 * Sample content under a blur: what the add-on looks like, never the user's data. Hidden from
 * screen readers – the benefit list next to it says the same in words.
 */
export function BlurredSample({ children, testID }: { children: ReactNode; testID?: string }) {
  const { scheme } = useTheme();
  const target = useRef<ComponentRef<typeof View>>(null);
  return (
    <View
      style={styles.sample}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <BlurTargetView ref={target}>{children}</BlurTargetView>
      <BlurView
        blurTarget={target}
        intensity={28}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        blurMethod="dimezisBlurViewSdk31Plus"
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const BENEFITS = ['diary', 'energy', 'checkIn', 'progress'] as const;

/**
 * The locked Body add-on (CLAUDE.md "Add-on rules"): a blurred sample, a short benefit list and
 * one way to the add-on paywall – never an empty or broken screen. Used by the tab, the deep
 * links and the "Energy today" card.
 */
export function BodyLockedPreview({ guard, sample }: { guard: AddonGuard; sample: ReactNode }) {
  const { t } = useTranslation();
  if (guard.state === 'pending') return <ListState kind="loading" label={t('common.loading')} />;
  return (
    <View style={styles.stack} testID="body-locked">
      <View style={styles.head}>
        <Text variant="heading" style={styles.flex}>
          {t('bodyAddon.locked.title')}
        </Text>
        <Badge label={t('bodyAddon.exampleBadge')} />
      </View>
      <BlurredSample testID="body-sample">{sample}</BlurredSample>
      <Card style={styles.stack}>
        {BENEFITS.map((key) => (
          <Text key={key}>{`• ${t(`bodyAddon.benefits.${key}`)}`}</Text>
        ))}
      </Card>
      <Button label={t('bodyAddon.unlock')} onPress={() => router.push('/body/addon')} />
    </View>
  );
}

const styles = StyleSheet.create({
  sample: { borderRadius: 16, overflow: 'hidden' },
  stack: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
