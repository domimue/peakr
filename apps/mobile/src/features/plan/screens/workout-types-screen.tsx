import { kindKey, WORKOUT_KINDS, type KindSport, type WorkoutKind } from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Badge, ChipGroup, Icon, IconBadge, radius, Screen, spacing, Text, useTheme } from '@/ui';

import { kindColor, kindIcon, kindName, SPORT_ICON } from '../kind';
import { usePlan } from '../queries';

const SPORT_ORDER: KindSport[] = ['run', 'bike', 'swim', 'brick', 'strength', 'winter', 'commute'];

export interface WorkoutTypesScreenProps {
  /** `kindKey` of the workout the user came from – opened and shown expanded. */
  focus?: string;
}

/**
 * What the calendar names mean (CLAUDE.md "UI patterns"): one collapsed row per type – icon,
 * name, one line and its zone and effort as a chip – grouped by sport. A tap opens how it is done
 * and what it is for. The user's own sports by default, all with "Show all"; a filter on top.
 */
export function WorkoutTypesScreen({ focus }: WorkoutTypesScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: stored } = usePlan();
  const focused = WORKOUT_KINDS.find((k) => kindKey(k) === focus);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(focus && focused ? [focus] : []));
  const [collapsed, setCollapsed] = useState<ReadonlySet<KindSport>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [only, setOnly] = useState<KindSport | null>(null);

  const planSports = stored?.input.profile.sports;
  const own = SPORT_ORDER.filter((s) => {
    if (!planSports) return true;
    if (s === 'run' || s === 'bike' || s === 'swim') return planSports.includes(s);
    if (s === 'brick') return planSports.includes('bike') && planSports.includes('run');
    if (s === 'winter') return (stored?.input.profile.winterSports ?? []).length > 0;
    return true;
  });
  // The type the user came from is always listed, even outside their own sports.
  const available = showAll
    ? SPORT_ORDER
    : SPORT_ORDER.filter((s) => own.includes(s) || s === focused?.sport);
  // Coming from a workout: its sport first, the type already open.
  const ordered = focused
    ? [focused.sport, ...available.filter((s) => s !== focused.sport)]
    : available;
  const sports = only && available.includes(only) ? [only] : ordered;

  const toggle = <T,>(set: ReadonlySet<T>, value: T) => {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  };

  return (
    <Screen>
      <Text tone="secondary">{t('workoutTypes.intro')}</Text>
      <ChipGroup
        label={t('workoutTypes.filter')}
        options={available.map((s) => ({ value: s, label: t(`workoutTypes.sports.${s}`) }))}
        selected={only && available.includes(only) ? [only] : []}
        onToggle={(s) => setOnly(only === s ? null : s)}
      />
      {planSports ? (
        <View style={styles.switchRow}>
          <Text style={styles.flex}>{t('workoutTypes.showAll')}</Text>
          <Switch
            accessibilityLabel={t('workoutTypes.showAll')}
            value={showAll}
            onValueChange={setShowAll}
            trackColor={{ true: colors.accent, false: colors.surface2 }}
            testID="types-show-all"
          />
        </View>
      ) : null}
      {sports.map((sport) => {
        const isCollapsed = collapsed.has(sport);
        return (
          <View key={sport} style={styles.section} testID={`types-${sport}`}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !isCollapsed }}
              onPress={() => setCollapsed(toggle(collapsed, sport))}
              style={styles.sectionTitle}
            >
              <Icon name={SPORT_ICON[sport]} size={22} color={colors.textMuted} />
              <Text variant="heading" accessibilityRole="header" style={styles.flex}>
                {t(`workoutTypes.sports.${sport}`)}
              </Text>
              <Icon
                name={isCollapsed ? 'chevronDown' : 'chevronUp'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
            {isCollapsed
              ? null
              : WORKOUT_KINDS.filter((k) => k.sport === sport).map((k) => (
                  <KindRow
                    key={kindKey(k)}
                    kind={k}
                    open={open.has(kindKey(k))}
                    onToggle={() => setOpen(toggle(open, kindKey(k)))}
                  />
                ))}
          </View>
        );
      })}
    </Screen>
  );
}

function KindRow({
  kind,
  open,
  onToggle,
}: {
  kind: WorkoutKind;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const key = kindKey(kind);
  const text = (field: string) => t(`workoutTypes.kinds.${key}.${field}` as never) as string;
  const color = kindColor(colors, kind);
  return (
    <View
      testID={`kind-${key}`}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: open ? color : 'transparent' },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${kindName(t, kind)}, ${text('short')}, ${text('chip')}`}
        onPress={onToggle}
        style={styles.rowHead}
      >
        <IconBadge name={kindIcon(kind)} color={color} size={36} />
        <View style={styles.flex}>
          <Text variant="label">{kindName(t, kind)}</Text>
          <Text variant="caption" tone="secondary">
            {text('short')}
          </Text>
        </View>
        <Badge label={text('chip')} />
      </Pressable>
      {open ? (
        <View style={styles.detail} testID={`kind-detail-${key}`}>
          <Text>{text('description')}</Text>
          <View style={styles.inline}>
            <Icon name="why" size={18} color={color} />
            <Text style={styles.flex}>{text('why')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { borderRadius: radius.md, borderWidth: 1.5, padding: spacing.sm, gap: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  detail: { gap: spacing.sm, paddingLeft: spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
});
