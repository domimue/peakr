import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { authAvailable } from '@/features/auth/session-store';
import { Button, Card, PeakrLogo, Screen, spacing, Text, useTheme } from '@/ui';

import { hasProgress, useQuizStore } from '../quiz-store';

/**
 * Start of the onboarding quiz: what to expect, that the quiz is free, and resume. Someone who
 * already has an account (e.g. bought on the website) signs in instead – the sync brings their plan.
 */
export function IntroScreen() {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const { hydrated, hydrate, answers, finished, reset } = useQuizStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const resume = hydrated && hasProgress(answers);

  return (
    <Screen
      title={t('quiz.intro.title')}
      header={<PeakrLogo tone={scheme === 'dark' ? 'onDark' : 'onLight'} height={36} />}
    >
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
      {authAvailable ? (
        <Button
          variant="secondary"
          label={t('auth.signIn.haveAccount')}
          onPress={() => router.push('/auth/sign-in')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  points: { gap: spacing.xs },
  free: { fontWeight: '600' },
});
