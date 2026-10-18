import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, spacing, Text } from '@/ui';

import { hasProgress, useQuizStore } from '../quiz-store';

/** Start of the onboarding quiz: what to expect, that the quiz is free, and resume. */
export function IntroScreen() {
  const { t } = useTranslation();
  const { hydrated, hydrate, answers, finished, reset } = useQuizStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const resume = hydrated && hasProgress(answers);

  return (
    <Screen title={t('quiz.intro.title')}>
      <Text tone="secondary">{t('quiz.intro.text')}</Text>
      <View style={styles.points}>
        {(['zones', 'week', 'forecast'] as const).map((p) => (
          <Text key={p}>{`•  ${t(`quiz.intro.points.${p}`)}`}</Text>
        ))}
      </View>
      <Card>
        <Text style={styles.free}>{t('quiz.intro.free')}</Text>
      </Card>
      <Button
        label={resume ? t('quiz.intro.resume') : t('quiz.intro.start')}
        disabled={!hydrated}
        onPress={() => router.push(finished ? '/onboarding/forecast' : '/onboarding/quiz')}
      />
      {resume ? (
        <Button
          variant="secondary"
          label={t('quiz.intro.restart')}
          onPress={async () => {
            await reset();
            router.push('/onboarding/quiz');
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  points: { gap: spacing.xs },
  free: { fontWeight: '600' },
});
