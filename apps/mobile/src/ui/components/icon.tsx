import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';

type SymbolName = Extract<SymbolViewProps['name'], { ios?: unknown }>;

/**
 * App icons by meaning: SF Symbols on iOS, Material Symbols on Android (both via expo-symbols).
 * Add new icons here, never use symbol names directly in screens.
 */
const ICONS = {
  run: { ios: 'figure.run', android: 'directions_run' },
  bike: { ios: 'figure.outdoor.cycle', android: 'directions_bike' },
  swim: { ios: 'figure.pool.swim', android: 'pool' },
  strength: { ios: 'dumbbell.fill', android: 'fitness_center' },
  brick: { ios: 'arrow.left.arrow.right', android: 'sync_alt' },
  winter: { ios: 'figure.skiing.crosscountry', android: 'downhill_skiing' },
  commute: { ios: 'briefcase.fill', android: 'work' },
  travel: { ios: 'airplane', android: 'flight' },
  easy: { ios: 'leaf.fill', android: 'eco' },
  long: { ios: 'road.lanes', android: 'route' },
  tempo: { ios: 'speedometer', android: 'speed' },
  threshold: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up' },
  intervals: { ios: 'timer', android: 'timer' },
  hills: { ios: 'mountain.2.fill', android: 'landscape' },
  technique: { ios: 'figure.mind.and.body', android: 'self_improvement' },
  speed: { ios: 'bolt.fill', android: 'bolt' },
  openwater: { ios: 'water.waves', android: 'waves' },
  test: { ios: 'flag.checkered', android: 'flag' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  distance: { ios: 'point.topleft.down.to.point.bottomright.curvepath', android: 'route' },
  sessions: { ios: 'checklist', android: 'event_available' },
  time: { ios: 'clock', android: 'schedule' },
  heart: { ios: 'heart.fill', android: 'monitor_heart' },
  structure: { ios: 'list.bullet', android: 'format_list_bulleted' },
  why: { ios: 'lightbulb.fill', android: 'lightbulb' },
  info: { ios: 'info.circle', android: 'info' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  skip: { ios: 'minus.circle', android: 'do_not_disturb_on' },
  move: { ios: 'arrow.up.and.down.and.arrow.left.and.right', android: 'open_with' },
  pause: { ios: 'pause.circle.fill', android: 'pause_circle' },
  play: { ios: 'play.circle.fill', android: 'play_circle' },
  tune: { ios: 'slider.horizontal.3', android: 'tune' },
  book: { ios: 'book.fill', android: 'menu_book' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  chevronUp: { ios: 'chevron.up', android: 'expand_less' },
  bolt: { ios: 'bolt.fill', android: 'bolt' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  close: { ios: 'xmark', android: 'close' },
  today: { ios: 'sun.max.fill', android: 'today' },
  plan: { ios: 'list.bullet.rectangle', android: 'view_agenda' },
  progress: { ios: 'chart.bar.fill', android: 'bar_chart' },
  profile: { ios: 'person.crop.circle', android: 'person' },
  plus: { ios: 'plus', android: 'add' },
  route: { ios: 'map.fill', android: 'map' },
  location: { ios: 'location.fill', android: 'my_location' },
  link: { ios: 'link', android: 'link' },
  warmup: { ios: 'flame.fill', android: 'local_fire_department' },
  watch: { ios: 'applewatch', android: 'watch' },
  weather: { ios: 'cloud.sun.fill', android: 'partly_cloudy_day' },
  wxClear: { ios: 'sun.max.fill', android: 'sunny' },
  wxPartlyCloudy: { ios: 'cloud.sun.fill', android: 'partly_cloudy_day' },
  wxCloudy: { ios: 'cloud.fill', android: 'cloud' },
  wxFog: { ios: 'cloud.fog.fill', android: 'foggy' },
  wxDrizzle: { ios: 'cloud.drizzle.fill', android: 'rainy_light' },
  wxRain: { ios: 'cloud.rain.fill', android: 'rainy' },
  wxSnow: { ios: 'cloud.snow.fill', android: 'weather_snowy' },
  wxFreezingRain: { ios: 'cloud.sleet.fill', android: 'rainy_snow' },
  wxThunderstorm: { ios: 'cloud.bolt.rain.fill', android: 'thunderstorm' },
  wind: { ios: 'wind', android: 'air' },
  indoor: { ios: 'house.fill', android: 'home' },
  outdoor: { ios: 'tree.fill', android: 'park' },
  trophy: { ios: 'trophy.fill', android: 'emoji_events' },
  units: { ios: 'ruler', android: 'straighten' },
  bell: { ios: 'bell.fill', android: 'notifications' },
  language: { ios: 'globe', android: 'language' },
  appearance: { ios: 'circle.lefthalf.filled', android: 'contrast' },
  connections: { ios: 'arrow.triangle.2.circlepath', android: 'sync' },
  subscription: { ios: 'creditcard.fill', android: 'credit_card' },
  account: { ios: 'person.fill', android: 'manage_accounts' },
  privacy: { ios: 'lock.fill', android: 'lock' },
  reset: { ios: 'arrow.counterclockwise', android: 'restart_alt' },
  error: { ios: 'exclamationmark.circle', android: 'error' },
} as const satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}

/** Decorative icon (hidden from screen readers – the text next to it carries the meaning). */
export function Icon({ name, size = 20, color, style }: IconProps) {
  const { colors } = useTheme();
  return (
    <SymbolView
      name={ICONS[name]}
      size={size}
      tintColor={color ?? colors.text}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export interface IconBadgeProps {
  name: IconName;
  /** Icon colour; the badge background is the same colour, faint. */
  color: string;
  size?: number;
}

/** Icon in a round tinted badge (sport markers, list entries). */
export function IconBadge({ name, color, size = 36 }: IconBadgeProps) {
  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: color, opacity: 0.16, borderRadius: size / 2 },
        ]}
      />
      <Icon name={name} size={Math.round(size * 0.55)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
