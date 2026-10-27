import {
  formatDuration,
  historyByMonth,
  type PlanNote,
  type PlanSummary,
  type SummaryGroup,
} from '@peakr/engine';
import { router, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import type { ArchivedPlan } from '@/data/repositories/plan-repository';
import { useUnits } from '@/features/settings/units';
import { Button, Card, LinkRow, ListState, numeric, Screen, spacing, Text } from '@/ui';

import { formatDate } from '../plan/calendar';
import { calendarTitle, typeName } from '../plan/kind';
import { useArchivedPlans } from '../plan/queries';
import { BadgeShelf, goalName } from './badges';
import { exportPlanHistory } from './export';
import { useUndoablePlan, useUndoNewPlan } from './queries';

const GROUPS: readonly SummaryGroup[] = ['long', 'quality', 'easy', 'strength'];

function dates(t: TFunction, language: string, summary: PlanSummary): string {
  const f = (iso: string) =>
    formatDate(iso, language, { day: 'numeric', month: 'short', year: 'numeric' });
  return t('planHistory.dates', { from: f(summary.startDate), to: f(summary.coveredUntil) });
}

function sessionsLine(t: TFunction, summary: PlanSummary): string {
  return t('planHistory.sessions', {
    done: summary.sessionsDone,
    planned: summary.sessionsPlanned,
    percent: Math.round(summary.completion * 100),
  });
}

/** Plans with nothing to show (replaced on their first day) stay out of the list. */
const shown = (a: ArchivedPlan) => a.summary.sessionsPlanned > 0 || a.summary.sessionsDone > 0;

/**
 * Profile → Plan history (CLAUDE.md "Plan history"): badges, every archived plan with its goal,
 * dates, outcome and completion (read-only), the JSON export, and – on the day a new plan was
 * created – "bring back my previous plan".
 */
export function PlanHistoryScreen() {
  const { t, i18n } = useTranslation();
  const { data: archived, isPending } = useArchivedPlans();
  const undoable = useUndoablePlan();
  const undo = useUndoNewPlan();
  const [exportError, setExportError] = useState(false);
  if (isPending) return <ListState kind="loading" label={t('common.loading')} />;
  const list = (archived ?? []).filter(shown);

  const confirmUndo = () =>
    Alert.alert(t('planHistory.undo.confirmTitle'), t('planHistory.undo.confirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('planHistory.undo.confirm'),
        onPress: () => undo.mutate(undefined, { onSuccess: () => router.replace('/plan') }),
      },
    ]);

  return (
    <Screen>
      {undoable.data ? (
        <Card testID="undo-plan">
          <Text variant="label">{t('planHistory.undo.title')}</Text>
          <Text tone="secondary">{t('planHistory.undo.message')}</Text>
          <Button
            variant="secondary"
            icon="undo"
            label={t('planHistory.undo.action')}
            onPress={confirmUndo}
            testID="undo-plan-button"
          />
        </Card>
      ) : null}

      {list.length === 0 ? (
        <ListState
          kind="empty"
          icon="calendar"
          title={t('planHistory.empty')}
          message={t('planHistory.emptyHint')}
        />
      ) : (
        <>
          <Text tone="secondary">{t('planHistory.hint')}</Text>
          <BadgeShelf archived={list} />
          {list.map((a) => (
            <LinkRow
              key={a.id}
              title={`${goalName(t, a.goal.kind)} · ${t(`planHistory.outcome.${a.outcome}`)}`}
              hint={`${dates(t, i18n.language, a.summary)}\n${sessionsLine(t, a.summary)}`}
              icon={a.outcome === 'completed' ? 'trophy' : 'calendar'}
              onPress={() => router.push(`/training/plan-history/${encodeURIComponent(a.id)}`)}
            />
          ))}
          <Button
            variant="secondary"
            label={t('planHistory.export')}
            onPress={async () =>
              setExportError((await exportPlanHistory(list, todayIso())) === 'failed')
            }
            testID="export-plan-history"
          />
          {exportError ? <Text tone="danger">{t('planHistory.exportFailed')}</Text> : null}
        </>
      )}
    </Screen>
  );
}

/** What the review of this plan changed in the next one (stored with the archived plan). */
function reviewLines(plan: ArchivedPlan): PlanNote[] {
  const lines = plan.review?.lines;
  return Array.isArray(lines) ? (lines as PlanNote[]) : [];
}

/** One archived plan, read-only: outcome, sessions per group, and the sessions that were done. */
export function ArchivedPlanScreen() {
  const { t, i18n } = useTranslation();
  const { distance } = useUnits();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: archived, isPending } = useArchivedPlans();
  if (isPending) return <ListState kind="loading" label={t('common.loading')} />;
  const plan = archived?.find((a) => a.id === id);
  if (!plan) return <ListState kind="empty" icon="calendar" title={t('planHistory.empty')} />;
  const { summary } = plan;
  const months = historyByMonth([
    { planId: plan.id, state: plan.state, profile: plan.input.profile },
  ]);
  return (
    <Screen title={goalName(t, plan.goal.kind)}>
      <Card testID="archived-summary">
        <Text variant="label">{t(`planHistory.outcome.${plan.outcome}`)}</Text>
        <Text tone="secondary">{t(`planHistory.outcomeHint.${plan.outcome}`)}</Text>
        <Text>{dates(t, i18n.language, summary)}</Text>
        <Text style={numeric}>{sessionsLine(t, summary)}</Text>
        <Text style={numeric}>
          {t('planHistory.figures', {
            time: formatDuration(summary.minutesDone * 60),
            distance: distance(summary.kmDone, 0),
          })}
        </Text>
        {GROUPS.filter((g) => summary.byGroup[g].planned > 0).map((g) => (
          <View key={g} style={styles.row}>
            <Text tone="secondary" style={styles.flex}>
              {t(`planHistory.groups.${g}`)}
            </Text>
            <Text style={numeric}>
              {t('planHistory.groupLine', {
                done: summary.byGroup[g].done,
                planned: summary.byGroup[g].planned,
              })}
            </Text>
          </View>
        ))}
      </Card>
      {reviewLines(plan).length > 0 ? (
        <Card testID="archived-review">
          <Text variant="label">{t('planHistory.review')}</Text>
          {reviewLines(plan).map((l) => (
            <Text key={l.key}>
              {`•  ${t(`planReview.lines.${l.key}` as never, { ...l.params }) as string}`}
            </Text>
          ))}
        </Card>
      ) : null}
      <Text variant="heading">{t('planHistory.doneSessions')}</Text>
      {months.flatMap((m) =>
        m.entries.map((e) => (
          <Text key={e.workout.id} testID={`archived-${e.workout.id}`}>
            {`${formatDate(e.workout.date, i18n.language, { day: 'numeric', month: 'short' })} · ${calendarTitle(t, e.workout)} · ${typeName(t, e.workout.type)}`}
          </Text>
        )),
      )}
      <Text variant="caption" tone="secondary">
        {t('planHistory.readOnly')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
