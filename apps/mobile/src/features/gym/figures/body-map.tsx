import type { MuscleGroup, MuscleShade } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { spacing, Text, useTheme } from '@/ui';

/**
 * Body map (CLAUDE.md "Gym" statistics): front and back silhouette in the Peakr line style, every
 * muscle group shaded by its sets this week. Our own simple geometry, no anatomy artwork copied.
 * Colour never carries the meaning alone – the list next to it names every muscle with its sets.
 */

interface Region {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Drawn on both sides (mirrored at x = 50). */
  pair?: boolean;
}

const FRONT: Partial<Record<MuscleGroup, Region>> = {
  neck: { cx: 50, cy: 31, rx: 4, ry: 3 },
  front_delts: { cx: 36, cy: 44, rx: 5, ry: 5, pair: true },
  side_delts: { cx: 29, cy: 47, rx: 3.5, ry: 5.5, pair: true },
  chest: { cx: 43, cy: 52, rx: 7, ry: 5.5, pair: true },
  biceps: { cx: 27, cy: 62, rx: 3.5, ry: 8, pair: true },
  forearms: { cx: 24, cy: 82, rx: 3, ry: 9, pair: true },
  abs: { cx: 50, cy: 74, rx: 5.5, ry: 12 },
  obliques: { cx: 40.5, cy: 76, rx: 3, ry: 9, pair: true },
  hip_flexors: { cx: 43.5, cy: 92, rx: 3.5, ry: 3.5, pair: true },
  adductors: { cx: 46.5, cy: 108, rx: 2.5, ry: 10, pair: true },
  quads: { cx: 40, cy: 116, rx: 5.5, ry: 15, pair: true },
  shins: { cx: 40, cy: 152, rx: 3, ry: 12, pair: true },
};

const BACK: Partial<Record<MuscleGroup, Region>> = {
  traps: { cx: 50, cy: 39, rx: 10, ry: 5 },
  rear_delts: { cx: 33, cy: 46, rx: 4.5, ry: 4.5, pair: true },
  upper_back: { cx: 50, cy: 53, rx: 8, ry: 5 },
  lats: { cx: 41, cy: 64, rx: 5.5, ry: 9, pair: true },
  triceps: { cx: 27, cy: 62, rx: 3.5, ry: 8, pair: true },
  lower_back: { cx: 50, cy: 80, rx: 5.5, ry: 6 },
  abductors: { cx: 35.5, cy: 95, rx: 2.5, ry: 6, pair: true },
  glutes: { cx: 43.5, cy: 97, rx: 6.5, ry: 7, pair: true },
  hamstrings: { cx: 41, cy: 120, rx: 5, ry: 14, pair: true },
  calves: { cx: 40, cy: 150, rx: 4.5, ry: 11, pair: true },
};

/** Outline of one side of the body (mirrored), viewBox 0 0 100 175. */
const OUTLINE =
  'M50 26 C45 26 44 29 44 32 L36 38 C29 39 26 43 24 52 L20 90 L23 92 L28 70 L31 60 L33 88 ' +
  'L34 98 L33 138 L35 166 L45 166 L46 138 L48 104 L50 102';

function mirror(path: string): string {
  return path.replace(
    /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
    (_, x: string, y: string) => `${100 - Number(x)} ${y}`,
  );
}

export interface BodyMapProps {
  shades: readonly MuscleShade[];
  accessibilityLabel: string;
}

export function BodyMap({ shades, accessibilityLabel }: BodyMapProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const byMuscle = new Map(shades.map((s) => [s.muscle, s]));

  const view = (regions: Partial<Record<MuscleGroup, Region>>, label: string, testID: string) => (
    <View style={styles.figure}>
      <Svg width="100%" height={220} viewBox="0 0 100 175" testID={testID}>
        <Circle cx={50} cy={16} r={9} fill="none" stroke={colors.textMuted} strokeWidth={1.2} />
        {[OUTLINE, mirror(OUTLINE)].map((d) => (
          <Path
            key={d}
            d={d}
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {(Object.entries(regions) as [MuscleGroup, Region][]).flatMap(([muscle, r]) => {
          const shade = byMuscle.get(muscle)?.shade ?? 0;
          const fill = shade > 0 ? colors.typeStrength : colors.surface2;
          const opacity = shade > 0 ? 0.25 + 0.75 * shade : 1;
          const xs = r.pair ? [r.cx, 100 - r.cx] : [r.cx];
          return xs.map((cx) => (
            <Ellipse
              key={`${muscle}-${cx}`}
              cx={cx}
              cy={r.cy}
              rx={r.rx}
              ry={r.ry}
              fill={fill}
              fillOpacity={opacity}
              stroke={colors.border}
              strokeWidth={0.6}
            />
          ));
        })}
      </Svg>
      <Text variant="micro" tone="secondary">
        {label}
      </Text>
    </View>
  );

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.row}>
        {view(FRONT, t('gym.stats.front'), 'body-map-front')}
        {view(BACK, t('gym.stats.back'), 'body-map-back')}
      </View>
      <View style={styles.legend}>
        {[0, 0.5, 1].map((s) => (
          <View key={s} style={styles.legendItem}>
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: s > 0 ? colors.typeStrength : colors.surface2,
                  opacity: s > 0 ? 0.25 + 0.75 * s : 1,
                  borderColor: colors.border,
                },
              ]}
            />
            <Text variant="micro" tone="secondary">
              {t(`gym.stats.legend.${s === 0 ? 'none' : s < 1 ? 'some' : 'target'}`)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  figure: { flex: 1, alignItems: 'center', gap: spacing.xs },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1 },
});
