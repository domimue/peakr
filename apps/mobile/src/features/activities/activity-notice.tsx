import type { ActivityNotice } from '@/data/activities/apply';
import { onActivities } from '@/data/activities/events';
import { todayIso } from '@/data/ids';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, radius, spacing, Text, useTheme } from '@/ui';

import { formatDate } from '../plan/calendar';

const VISIBLE_MS = 5_000;

/**
 * One line about new activities (CLAUDE.md "After import"), e.g. "Run synced from Strava –
 * Thursday's session marked as done". Several at once (first sync) become one summary line.
 */
export function noticeText(
  t: TFunction,
  notices: readonly ActivityNotice[],
  language: string,
  today = todayIso(),
): string {
  const [first] = notices;
  if (!first) return '';
  const source = t(`activities.source.${first.source}`);
  if (notices.length > 1) return t('activities.notice.many', { count: notices.length, source });
  const sport = t(`activities.sport.${first.sport}`);
  if (first.kind === 'matched') {
    if (first.date === today) return t('activities.notice.matchedToday', { sport, source });
    const day = formatDate(first.date, language, { weekday: 'long' });
    return t('activities.notice.matched', { sport, source, day });
  }
  return first.adjusted > 0
    ? t('activities.notice.unplannedAdjusted', { sport, source })
    : t('activities.notice.unplanned', { sport, source });
}

/** Short in-app notice at the top of the screen; tapping it opens the matched session. */
export function ActivityNoticeHost() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [notices, setNotices] = useState<readonly ActivityNotice[]>([]);

  useEffect(() => onActivities(setNotices), []);
  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => setNotices([]), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notices]);

  if (notices.length === 0) return null;
  const text = noticeText(t, notices, i18n.language);
  const workoutId = notices.length === 1 ? notices[0]?.workoutId : undefined;
  return (
    <Animated.View
      entering={FadeInUp}
      exiting={FadeOutUp}
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole={workoutId ? 'button' : 'text'}
        accessibilityLiveRegion="polite"
        accessibilityLabel={text}
        onPress={() => {
          setNotices([]);
          if (workoutId) router.push(`/training/workout/${workoutId}`);
        }}
        style={[styles.card, { backgroundColor: colors.surface2, borderColor: colors.border }]}
      >
        <Icon name="check" size={18} color={colors.text} />
        <Text style={styles.text}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: { flex: 1 },
});
