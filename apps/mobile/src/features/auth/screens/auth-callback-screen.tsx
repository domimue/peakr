import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { takePendingLink } from '@/features/deep-links/pending-link';
import { Button, Screen, Text } from '@/ui';

import { completeSignIn } from '../auth';

/** peakr://auth/callback?code=… – the magic link (and OAuth) lands here. */
export function AuthCallbackScreen() {
  const { t } = useTranslation();
  const { code, error_description: providerError } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const [exchangeFailed, setExchangeFailed] = useState(false);
  const failed = exchangeFailed || !code || Boolean(providerError);

  useEffect(() => {
    if (!code || providerError) return;
    completeSignIn(code)
      .then(() => router.replace(takePendingLink() ?? '/today'))
      .catch((e: unknown) => {
        console.warn('Sign-in link failed', e);
        setExchangeFailed(true);
      });
  }, [code, providerError]);

  return (
    <Screen title={t('auth.signIn.title')}>
      {failed ? (
        <>
          <Text>{t('auth.callback.failed')}</Text>
          <Button
            label={t('auth.callback.again')}
            onPress={() => router.replace('/auth/sign-in')}
          />
        </>
      ) : (
        <Text tone="secondary">{t('auth.callback.signingIn')}</Text>
      )}
    </Screen>
  );
}
