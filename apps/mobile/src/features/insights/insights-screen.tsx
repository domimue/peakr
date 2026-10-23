import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHealthStatus } from '@/features/health-data/queries';
import { PlanInsights } from '@/features/progress/progress-screen';
import { SegmentedControl, spacing, Text, useTheme } from '@/ui';

import { HealthOverview } from './health/health-overview';

type Segment = 'health' | 'training' | 'records';

/**
 * Insights (CLAUDE.md "UI patterns"): Health (body and recovery data), Training (activity
 * history) and Records (performance and personal bests). Opens on Health once a health source is
 * connected, because that is what people check daily; before that on Training.
 */
export function InsightsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: status } = useHealthStatus();
  const connected = !!status?.connection;
  // Until the user picks a segment, the connection decides where Insights opens.
  const [segment, setSegment] = useState<Segment | null>(null);
  const current = segment ?? (connected ? 'health' : 'training');

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} testID="insights-scroll">
        <Text variant="title" accessibilityRole="header">
          {t('insights.title')}
        </Text>
        <SegmentedControl
          options={[
            { value: 'health', label: t('insights.segments.health') },
            { value: 'training', label: t('insights.segments.training') },
            { value: 'records', label: t('insights.segments.records') },
          ]}
          value={current}
          onChange={setSegment}
        />
        {current === 'health' ? (
          <HealthOverview />
        ) : (
          <PlanInsights section={current === 'training' ? 'history' : 'performance'} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});
