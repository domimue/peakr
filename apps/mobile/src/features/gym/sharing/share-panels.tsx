import { type ShareChoice, type ShareState } from '@peakr/engine';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { selectAccountUserId, useSessionStore } from '@/features/auth/session-store';
import { health } from '@/features/health/health';
import { useIntegrations } from '@/features/integrations/queries';
import { Button, Card, SegmentedControl, spacing, Text } from '@/ui';

import {
  allowStravaPosting,
  resumeStravaPoll,
  shareToHealth,
  shareToStrava,
  useShareStore,
  type SessionData,
} from './share-store';
import { splitError } from './strava-runner';

/** Whether this device can write to a health store (hidden otherwise). */
export function useHealthSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let alive = true;
    void health.isSupported().then((ok) => alive && setSupported(ok));
    return () => {
      alive = false;
    };
  }, []);
  return supported;
}

export function useStravaConnected(): boolean {
  const userId = useSessionStore(selectAccountUserId);
  const { data } = useIntegrations(userId);
  return (data ?? []).some((i) => i.provider === 'strava' && i.status === 'active');
}

function OnOff({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.block}>
      <Text variant="label">{label}</Text>
      {hint ? (
        <Text variant="caption" tone="secondary">
          {hint}
        </Text>
      ) : null}
      <SegmentedControl
        options={[
          { value: 'off', label: t('stravaPost.settingOff') },
          { value: 'on', label: t('stravaPost.settingOn') },
        ]}
        value={value ? 'on' : 'off'}
        onChange={(v) => onChange(v === 'on')}
      />
    </View>
  );
}

/**
 * Before saving a session: where should it go? Both switches start from the user's saved defaults
 * (off until they are switched on once) and apply to this session only.
 */
export function ShareChoicePanel({
  choice,
  onChange,
}: {
  choice: ShareChoice;
  onChange: (choice: ShareChoice) => void;
}) {
  const { t } = useTranslation();
  const stravaConnected = useStravaConnected();
  const healthSupported = useHealthSupported();
  return (
    <Card style={styles.card} testID="share-choice">
      {stravaConnected ? (
        <OnOff
          label={t('stravaPost.toggle')}
          value={choice.strava}
          onChange={(strava) => onChange({ ...choice, strava })}
        />
      ) : (
        <Text variant="caption" tone="secondary">
          {t('stravaPost.notConnected')}
        </Text>
      )}
      {healthSupported ? (
        <OnOff
          label={t('healthWrite.settingTitle', {
            store: t(`healthWrite.stores.${health.store}`),
          })}
          value={choice.health}
          onChange={(h) => onChange({ ...choice, health: h })}
        />
      ) : null}
    </Card>
  );
}

function stravaMessage(t: TFunction, state: ShareState): string {
  const { code, detail } = splitError(state.error);
  switch (code) {
    case 'not_connected':
      return t('stravaPost.notConnected');
    case 'reconnect':
      return t('stravaPost.reconnect');
    case 'rate_limited':
      return t('stravaPost.rateLimited');
    default:
      return detail ? t('stravaPost.error', { reason: detail }) : t('stravaPost.failed');
  }
}

/** Status of one saved session on Strava and in the health store, with retry. */
export function ShareStatusPanel({ data }: { data: SessionData }) {
  const { t } = useTranslation();
  const sessionId = data.session.id;
  const states = useShareStore((s) => s.states[sessionId]);
  const load = useShareStore((s) => s.load);
  const stravaConnected = useStravaConnected();
  const healthSupported = useHealthSupported();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void load(sessionId).then(() => {
      // A post that was still processing when the app closed picks up where it stopped.
      if (useShareStore.getState().states[sessionId]?.strava?.status === 'posting') {
        void resumeStravaPoll(sessionId);
      }
    });
  }, [load, sessionId]);

  const strava = states?.strava;
  const healthState = states?.health;
  const store = t(`healthWrite.stores.${health.store}`);
  const hasSets = data.sets.some((s) => s.completed);
  if (!strava && !healthState && !stravaConnected && !healthSupported) return null;

  const stravaFailureCode = strava?.status === 'failed' ? splitError(strava.error).code : null;

  return (
    <Card style={styles.card} testID="share-status">
      <Text variant="heading">{t('stravaPost.title')}</Text>
      {strava?.status === 'posting' ? <Text>{t('stravaPost.posting')}</Text> : null}
      {strava?.status === 'posted' ? (
        <Text>
          {t('stravaPost.posted')}
          {strava.remoteId ? ` · ${t('stravaPost.openOnStrava', { id: strava.remoteId })}` : ''}
          {strava.format === 'plain' ? ` · ${t('stravaPost.unavailableTitle')}` : ''}
        </Text>
      ) : null}
      {strava?.status === 'needs_scope' ? (
        <>
          <Text variant="label">{t('stravaPost.scopeTitle')}</Text>
          <Text tone="secondary">{t('stravaPost.scopeBody')}</Text>
          <Button
            label={t('stravaPost.scopeAllow')}
            onPress={async () => {
              const result = await allowStravaPosting(data);
              setNote(result === 'denied' ? t('stravaPost.scopeDenied') : null);
            }}
          />
        </>
      ) : null}
      {strava?.status === 'failed' ? (
        <>
          <Text>{stravaMessage(t, strava)}</Text>
          {stravaFailureCode === 'structured_unavailable' ? (
            <>
              <Text variant="label">{t('stravaPost.unavailableTitle')}</Text>
              <Text tone="secondary">{t('stravaPost.unavailableBody')}</Text>
              <Button
                variant="secondary"
                label={t('stravaPost.postPlain')}
                onPress={() => void shareToStrava(data, { plain: true })}
              />
            </>
          ) : (
            <Button
              variant="secondary"
              label={t('stravaPost.retry')}
              onPress={() => void shareToStrava(data)}
            />
          )}
        </>
      ) : null}
      {!strava && stravaConnected && hasSets ? (
        <Button
          variant="secondary"
          icon="upload"
          label={t('stravaPost.post')}
          onPress={() => void shareToStrava(data)}
        />
      ) : null}
      {!strava && stravaConnected && !hasSets ? (
        <Text variant="caption" tone="secondary">
          {t('stravaPost.quickNote')}
        </Text>
      ) : null}
      {note ? <Text tone="secondary">{note}</Text> : null}

      {healthSupported || healthState ? (
        <View style={styles.block}>
          {healthState?.status === 'posted' ? (
            <Text>{t('healthWrite.saved', { store })}</Text>
          ) : null}
          {healthState?.status === 'posting' ? <Text>{t('stravaPost.posting')}</Text> : null}
          {healthState?.status === 'failed' ? (
            <Text>{t('healthWrite.failed', { store })}</Text>
          ) : null}
          {healthSupported && healthState?.status !== 'posted' ? (
            <Button
              variant="secondary"
              label={t('healthWrite.settingTitle', { store })}
              onPress={() => void shareToHealth(data)}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  block: { gap: spacing.xs },
});
