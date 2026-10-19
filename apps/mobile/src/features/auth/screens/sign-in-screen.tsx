import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Card, radius, Screen, spacing, Text, TextField, useTheme } from '@/ui';

import {
  appleSignInAvailable,
  sendMagicLink,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from '../auth';
import { authAvailable, useSessionStore } from '../session-store';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Email magic link (+ code), Google and Apple. Leaves for Today as soon as a session exists. */
export function SignInScreen() {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const session = useSessionStore((s) => s.session);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();

  useEffect(() => {
    if (session) router.replace('/today');
  }, [session]);

  async function attempt(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      console.warn('Sign-in failed', e);
      setError(t('auth.signIn.failed'));
    } finally {
      setBusy(false);
    }
  }

  const send = () => {
    if (!EMAIL.test(email.trim())) return setEmailError(t('auth.signIn.invalidEmail'));
    setEmailError(undefined);
    void attempt(async () => {
      await sendMagicLink(email);
      setSentTo(email.trim().toLowerCase());
    });
  };

  if (!authAvailable) {
    return (
      <Screen title={t('auth.signIn.title')}>
        <Card>
          <Text>{t('auth.signIn.notConfigured')}</Text>
        </Card>
        <Button variant="secondary" label={t('common.back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title={t('auth.signIn.title')}>
      <Text tone="secondary">{t('auth.signIn.intro')}</Text>
      {sentTo === null ? (
        <>
          <TextField
            label={t('auth.signIn.email')}
            placeholder={t('auth.signIn.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            error={emailError}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            onSubmitEditing={send}
          />
          <Button label={t('auth.signIn.sendLink')} disabled={busy} onPress={send} />
        </>
      ) : (
        <>
          <Card>
            <Text>{t('auth.signIn.linkSent', { email: sentTo })}</Text>
          </Card>
          <TextField
            label={t('auth.signIn.code')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Button
            label={t('auth.signIn.verifyCode')}
            disabled={busy || code.trim().length < 6}
            onPress={() => void attempt(() => verifyEmailCode(sentTo, code))}
          />
          <Button
            variant="secondary"
            label={t('auth.signIn.otherEmail')}
            onPress={() => {
              setSentTo(null);
              setCode('');
            }}
          />
        </>
      )}
      <Text tone="secondary" style={styles.or}>
        {t('auth.signIn.or')}
      </Text>
      <Button
        variant="secondary"
        label={t('auth.signIn.google')}
        disabled={busy}
        onPress={() => void attempt(signInWithGoogle)}
      />
      {appleSignInAvailable ? (
        <View pointerEvents={busy ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={radius.sm}
            style={styles.apple}
            onPress={() => void attempt(signInWithApple)}
          />
        </View>
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" tone="secondary">
          {error}
        </Text>
      ) : null}
      {__DEV__ ? (
        <Button
          variant="secondary"
          label={t('auth.signIn.later')}
          onPress={() => router.replace('/today')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  or: { textAlign: 'center', marginVertical: spacing.xs },
  apple: { height: 48 },
});
