import { kindKey, WORKOUT_KINDS, type KindSport, type WorkoutKind } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, IconBadge, Screen, spacing, Text, useTheme } from '@/ui';

import { kindColor, kindIcon, kindName, SPORT_ICON } from '../kind';
import { usePlan } from '../queries';

const SPORT_ORDER: KindSport[] = ['run', 'bike', 'swim', 'brick', 'strength', 'winter'];

export interface WorkoutTypesScreenProps {
  /** `kindKey` of the workout the user came from – shown first. */
  focus?: string;
}

/**
 * What the calendar names mean: every workout kind with a short description, why it is in the
 * plan and how hard it feels. With a plan, only the disciplines of that plan are listed.
 */
export function WorkoutTypesScreen({ focus }: WorkoutTypesScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: stored } = usePlan();

  const planSports = stored?.input.profile.sports;
  const sports = SPORT_ORDER.filter((s) => {
    if (!planSports) return true;
    if (s === 'run' || s === 'bike' || s === 'swim') return planSports.includes(s);
    if (s === 'brick') return planSports.includes('bike') && planSports.includes('run');
    if (s === 'winter') return (stored?.input.profile.winterSports ?? []).length > 0;
    return true;
  });
  const focused = WORKOUT_KINDS.find((k) => kindKey(k) === focus);

  return (
    <Screen>
      <Text tone="secondary">{t('workoutTypes.intro')}</Text>
      {focused ? <KindCard kind={focused} highlighted /> : null}
      {sports.map((sport) => (
        <View key={sport} style={styles.section}>
          <View style={styles.sectionTitle}>
            <Icon name={SPORT_ICON[sport]} size={22} color={colors.textMuted} />
            <Text variant="heading" accessibilityRole="header">
              {t(`workoutTypes.sports.${sport}`)}
            </Text>
          </View>
          {WORKOUT_KINDS.filter((k) => k.sport === sport && kindKey(k) !== focus).map((k) => (
            <KindCard key={kindKey(k)} kind={k} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

function KindCard({ kind, highlighted }: { kind: WorkoutKind; highlighted?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const key = kindKey(kind);
  const text = (field: string) => t(`workoutTypes.kinds.${key}.${field}` as never) as string;
  const color = kindColor(colors, kind);
  return (
    <Card testID={`kind-${key}`} style={highlighted && { borderColor: color, borderWidth: 1.5 }}>
      <View style={styles.header}>
        <IconBadge name={kindIcon(kind)} color={color} size={44} />
        <View style={styles.flex}>
          <Text variant="label">{kindName(t, kind)}</Text>
          <Text variant="caption" tone="secondary">
            {text('short')}
          </Text>
        </View>
      </View>
      <Text>{text('description')}</Text>
      <View style={styles.row}>
        <Icon name="why" size={18} color={color} />
        <Text style={styles.flex}>{text('why')}</Text>
      </View>
      <View style={styles.row}>
        <Icon name="heart" size={18} color={color} />
        <Text variant="caption" tone="secondary" style={styles.flex}>
          {text('intensity')}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
});
