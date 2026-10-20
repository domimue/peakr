import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, spacing, Text } from '@/ui';

import { useRoutines } from '../queries';

/** "My own routines": the user's routines, each can be edited or started. */
export function RoutineListScreen() {
  const { t } = useTranslation();
  const routines = useRoutines();

  return (
    <Screen>
      <Text tone="secondary">{t('strength.routines.intro')}</Text>
      <Button
        label={t('strength.routines.new')}
        onPress={() => router.push('/strength/routines/new')}
      />
      {routines.data?.length === 0 ? (
        <Text tone="secondary">{t('strength.routines.empty')}</Text>
      ) : null}
      {routines.data?.map((r) => (
        <Card key={r.id} accessibilityLabel={r.name}>
          <Text variant="heading">{r.name}</Text>
          <Text variant="caption" tone="secondary">
            {t('strength.routines.summary', { count: r.exercises.length, minutes: r.durationMin })}
          </Text>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button
                variant="secondary"
                label={t('strength.routines.edit')}
                onPress={() =>
                  router.push({ pathname: '/strength/routines/[id]', params: { id: r.id } })
                }
              />
            </View>
            <View style={styles.action}>
              <Button
                label={t('strength.routines.start')}
                onPress={() =>
                  router.push({ pathname: '/strength/workout', params: { routineId: r.id } })
                }
              />
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
