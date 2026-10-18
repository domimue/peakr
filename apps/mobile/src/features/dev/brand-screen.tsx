import { colors as palette, fontSizes } from '@peakr/theme';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  numeric,
  PeakrLogo,
  PeakrMark,
  PeakrWordmark,
  radius,
  Screen,
  spacing,
  Text,
  useTheme,
  zoneColorKey,
  type ThemeColors,
} from '@/ui';

const ZONES = [1, 2, 3, 4, 5] as const;
const SWATCHES: (keyof ThemeColors)[] = [
  'bg',
  'surface',
  'surface2',
  'border',
  'text',
  'textMuted',
  'accent',
  'error',
  'warning',
  'info',
];

/** Storybook-like overview of the brand: logo variants and tones, colours, zones, type, buttons. */
export function BrandScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Screen>
      <Text variant="heading">{t('dev.brand.logo')}</Text>
      <View style={[styles.panel, { backgroundColor: palette.ink }]}>
        <Text variant="micro" style={{ color: palette.white }}>
          {t('dev.brand.onDark')}
        </Text>
        <PeakrLogo variant="lockup" tone="onDark" height={48} />
        <View style={styles.row}>
          <PeakrLogo variant="mark" tone="onDark" height={40} />
          <PeakrLogo variant="wordmark" tone="onDark" height={28} />
        </View>
      </View>
      <View style={[styles.panel, { backgroundColor: palette.white }]}>
        <Text variant="micro" style={{ color: palette.ink }}>
          {t('dev.brand.onLight')}
        </Text>
        <PeakrLogo variant="lockup" tone="onLight" height={48} />
      </View>
      <View style={[styles.panel, { backgroundColor: palette.volt }]}>
        <Text variant="micro" style={{ color: palette.ink }}>
          {t('dev.brand.onAccent')}
        </Text>
        <View style={styles.row}>
          <PeakrMark size={40} color={palette.ink} />
          <PeakrWordmark height={28} color={palette.ink} />
        </View>
      </View>

      <Text variant="heading">{t('dev.brand.colors')}</Text>
      <View style={styles.swatches}>
        {SWATCHES.map((key) => (
          <View key={key} style={styles.swatch}>
            <View
              style={[styles.chip, { backgroundColor: colors[key], borderColor: colors.border }]}
            />
            <Text variant="micro" tone="secondary">
              {key}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="heading">{t('dev.brand.zones')}</Text>
      <View style={styles.zones}>
        {ZONES.map((zone) => (
          <View key={zone} style={styles.zone}>
            <View style={[styles.zoneBar, { backgroundColor: colors[zoneColorKey(zone)] }]} />
            <Text variant="caption">{t('zones.label', { zone })}</Text>
          </View>
        ))}
      </View>

      <Text variant="heading">{t('dev.brand.type')}</Text>
      <Card>
        <Text variant="display">peakr {fontSizes.display}</Text>
        <Text variant="title">Title {fontSizes.xxl}</Text>
        <Text variant="subtitle">Subtitle {fontSizes.xl}</Text>
        <Text variant="heading">Heading {fontSizes.lg}</Text>
        <Text variant="label">Label {fontSizes.md}</Text>
        <Text>Body {fontSizes.md}</Text>
        <Text variant="caption">Caption {fontSizes.sm}</Text>
        <Text variant="micro">Micro {fontSizes.xs}</Text>
        <Text style={numeric}>{t('dev.brand.numbers')}</Text>
      </Card>

      <Text variant="heading">{t('dev.brand.buttons')}</Text>
      <Button label={t('dev.brand.primary')} />
      <Button variant="secondary" label={t('dev.brand.secondary')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 72, gap: spacing.xs },
  chip: { height: 40, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  zones: { flexDirection: 'row', gap: spacing.xs },
  zone: { flex: 1, gap: spacing.xs, alignItems: 'center' },
  zoneBar: { height: 32, alignSelf: 'stretch', borderRadius: radius.sm },
});
