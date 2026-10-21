import { DEFAULT_PLATE_SETUP, platesPerSide, type PlateSetup } from '@peakr/engine';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup, radius, spacing, Stepper, Text, useTheme } from '@/ui';

import { formatKg } from './format';
import { usePlateSetup, useSavePlateSetup } from './queries';

/** Every plate size the setup can offer (the gym's stock is chosen from these). */
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5] as const;
const PLATE_PAIRS = 4;

export interface PlateCalculatorProps {
  visible: boolean;
  targetKg: number;
  onClose: () => void;
}

/**
 * Plate calculator (CLAUDE.md "Gym"): plates per side for the set's weight, with the bar weight and
 * the plates of the user's gym (saved once, used everywhere).
 */
export function PlateCalculator({ visible, targetKg, onClose }: PlateCalculatorProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const stored = usePlateSetup();
  const save = useSavePlateSetup();
  const setup: PlateSetup = stored.data ?? DEFAULT_PLATE_SETUP;
  const load = platesPerSide(targetKg, setup);
  const kg = t('units.kg');
  const have = setup.plates.filter((p) => p.count >= 2).map((p) => String(p.kg));
  const maxPlate = Math.max(...PLATE_SIZES);

  const togglePlate = (value: string) => {
    const size = Number(value);
    const plates = have.includes(value)
      ? setup.plates.filter((p) => p.kg !== size)
      : [...setup.plates, { kg: size, count: PLATE_PAIRS * 2 }].sort((a, b) => b.kg - a.kg);
    save.mutate({ ...setup, plates });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />
      <SafeAreaView
        edges={['bottom']}
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
        accessibilityViewIsModal
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.head}>
            <Text variant="heading" style={styles.flex}>
              {t('gym.plates.title', { weight: formatKg(targetKg), unit: kg })}
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.accentLine }}>{t('common.close')}</Text>
            </Pressable>
          </View>
          {load.belowBar ? (
            <Text tone="secondary">
              {t('gym.plates.belowBar', { bar: formatKg(setup.barKg), unit: kg })}
            </Text>
          ) : (
            <>
              <View
                style={styles.bar}
                accessible
                accessibilityRole="image"
                accessibilityLabel={t('gym.plates.perSide', {
                  plates: load.perSide.map(formatKg).join(', ') || '–',
                })}
              >
                <View style={[styles.sleeve, { backgroundColor: colors.textMuted }]} />
                {load.perSide.map((p, i) => (
                  <View
                    key={`${p}-${i}`}
                    style={[
                      styles.plate,
                      {
                        height: 28 + 72 * (p / maxPlate),
                        backgroundColor: colors.typeStrength,
                        borderColor: colors.bg,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text variant="label">
                {t('gym.plates.perSide', {
                  plates: load.perSide.map(formatKg).join(' + ') || '–',
                })}
              </Text>
              {load.missingKg > 0 ? (
                <Text tone="danger">
                  {t('gym.plates.notExact', {
                    loaded: formatKg(load.totalKg),
                    missing: formatKg(load.missingKg),
                    unit: kg,
                  })}
                </Text>
              ) : null}
            </>
          )}
          <Stepper
            label={t('gym.plates.bar')}
            value={setup.barKg}
            min={0}
            max={30}
            step={2.5}
            onChange={(barKg) => save.mutate({ ...setup, barKg })}
            format={(n) => `${formatKg(n)} ${kg}`}
            decreaseLabel={t('common.decrease')}
            increaseLabel={t('common.increase')}
          />
          <ChipGroup
            label={t('gym.plates.available')}
            options={PLATE_SIZES.map((p) => ({ value: String(p), label: `${formatKg(p)} ${kg}` }))}
            selected={have}
            onToggle={togglePlate}
            multiple
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
  },
  content: { padding: spacing.md, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 104, gap: 2 },
  sleeve: { width: 48, height: 10, borderRadius: radius.sm },
  plate: { width: 14, borderRadius: radius.sm, borderWidth: 1 },
});
